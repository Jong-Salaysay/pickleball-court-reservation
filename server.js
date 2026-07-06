require("dotenv").config();
const express = require("express");
const db = require("./db");
const app = express();
const bcrypt = require("bcryptjs");
const session = require("express-session");
const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic();
app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: "pickleball_secret",
    resave: false,
    saveUninitialized: true,
}));


app.get("/api/test", async (req, res) => {
    const [rows] = await db.query("SELECT 1 + 1 AS result");
    res.json(rows);
});

app.post("/api/auth/register", async (req, res) => {
    console.log(req.body);
    const { first_name, last_name, email, contact_number, password, confirm_password } = req.body;

    if (!first_name || !last_name || !email || !contact_number || !password) {
        return res.status(400).send({ error: "All required fields are required" });
    }
    if (password !== confirm_password) {
        return res.status(400).send({ error: "Passwords do not match" });
    }

    try {
        const password_hash = await bcrypt.hash(password, 10);

        await db.query(
            "INSERT INTO users (email, password_hash, first_name, last_name, contact_number) VALUES (?, ?, ?, ?, ?)",
            [email, password_hash, first_name, last_name, contact_number]
        );

        res.redirect("/login.html");
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).send("Email already exists");
        }
        console.error(error);
        res.status(500).send("Something went wrong. Please try again.");
    }

});
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send("Email and password are required");
    }

    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    const user = rows[0];

    if (!user || !user.is_active) {
        return res.redirect("/login.html?error=1");
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
        return res.redirect("/login.html?error=1");
    }

    req.session.user = {
        id: user.id,
        first_name: user.first_name,
        role: user.role
    };

    if (user.role === "admin") {
        res.redirect("/admin.html");
    } else {
        res.redirect("/");
    }
});
app.get("/api/me", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json("Not logged in");
    }
    res.json(req.session.user);
});
app.get("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});
app.get("/api/availability", async (req, res) => {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: "Date is required" });
    const hours = [6, 7, 8, 17, 18, 19, 20, 21];
    const [bookings] = await db.query("SELECT start_time, end_time FROM bookings WHERE booking_date = ? AND status != 'cancelled'",
        [date]
    );
    const [openPlay] = await db.query("SELECT start_time, end_time FROM open_play_sessions WHERE session_date = ?",
        [date]
    );
    const [blocked] = await db.query("SELECT start_time, end_time FROM blocked_slots WHERE blocked_date = ?",
        [date]
    );

    function covered(list, hour) {
        return list.some(item => {
            const start = parseInt(item.start_time.slice(0, 2));
            const end = parseInt(item.end_time.slice(0, 2));
            return hour >= start && hour < end;
        });
    }

    const slots = hours.map(hour => {
        let status = "available";
        if (covered(blocked, hour)) status = "blocked";
        else if (covered(bookings, hour)) status = "reserved";
        else if (covered(openPlay, hour)) status = "open_play";
        return { hour, status };
    });

    res.json({ date, slots });
})

app.post("/api/bookings", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "You must be logged in to book." })
    }

    const { booking_date, start_hour, duration, payment_method } = req.body;
    if (!booking_date || !start_hour || !duration || !payment_method) {
        return res.status(400).json({ error: "Missing booking details." });
    }
    const start = parseInt(start_hour);
    const end = start + parseInt(duration);
    const okMorning = start >= 6 && end <= 9;
    const okEvening = start >= 17 && end <= 22;
    if (!okMorning && !okEvening) {
        return res.status(400).json({ error: "Booking must stay within operating hours." });
    }
    const [existing] = await db.query(
        "SELECT start_time, end_time FROM bookings WHERE booking_date = ? AND status != 'cancelled'",
        [booking_date]
    );
    for (let h = start; h < end; h++) {
        const taken = existing.some(b => h >= parseInt(b.start_time.slice(0, 2)) && h < parseInt(b.end_time.slice(0, 2))
        );
        if (taken) return res.status(409).json({ error: "Sorry, that slot is taken." });
    }
    const start_time = `${String(start).padStart(2, "0")}:00:00`;
    const end_time = `${String(end).padStart(2, "0")}:00:00`;
    await db.query(
        "INSERT INTO bookings (user_id, booking_date, start_time, end_time, payment_method) VALUES (?, ?, ?, ?, ?)",
        [req.session.user.id, booking_date, start_time, end_time, payment_method]
    );
    res.json({ success: true });
});

app.get("/api/bookings/mine", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
    const [rows] = await db.query(
        `SELECT id,
            DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date,
            start_time, end_time, payment_method, payment_status, status,
            TIMESTAMPDIFF(MINUTE, NOW(), TIMESTAMP(booking_date, start_time)) AS minutes_until
     FROM bookings
     WHERE user_id = ?
     ORDER BY booking_date DESC, start_time DESC`,
        [req.session.user.id]
    );
    res.json(rows);
});

app.post("/api/bookings/:id/cancel", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

    const [rows] = await db.query(
        `SELECT TIMESTAMPDIFF(MINUTE, NOW(), TIMESTAMP(booking_date, start_time)) AS minutes_until, status
     FROM bookings WHERE id = ? AND user_id = ?`,
        [req.params.id, req.session.user.id]
    );
    const booking = rows[0];
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.status === "cancelled") return res.status(400).json({ error: "Already cancelled" });
    if (booking.minutes_until <= 360) {
        return res.status(403).json({ error: "Cannot cancel within 6 hours of the booking." });
    }

    await db.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
});
function chatFormatHour(h) {
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = h > 12 ? h - 12 : h;
    return `${hour12}:00 ${suffix}`;
}

async function chatCheckAvailability(date) {
    if (!date) return "No date was provided.";
    const hours = [6, 7, 8, 17, 18, 19, 20, 21];
    const [bookings] = await db.query("SELECT start_time, end_time FROM bookings WHERE booking_date = ? AND status != 'cancelled'", [date]);
    const [openPlay] = await db.query("SELECT start_time, end_time FROM open_play_sessions WHERE session_date = ?", [date]);
    const [blocked] = await db.query("SELECT start_time, end_time FROM blocked_slots WHERE blocked_date = ?", [date]);

    function covered(list, hour) {
        return list.some(item => {
            const start = parseInt(item.start_time.slice(0, 2));
            const end = parseInt(item.end_time.slice(0, 2));
            return hour >= start && hour < end;
        });
    }

    const lines = hours.map(hour => {
        let status = "available";
        if (covered(blocked, hour)) status = "unavailable";
        else if (covered(bookings, hour)) status = "reserved";
        else if (covered(openPlay, hour)) status = "open play";
        return `${chatFormatHour(hour)}: ${status}`;
    });
    return `Availability for ${date}:\n${lines.join("\n")}`;
}

async function chatCreateBooking(user, input) {
    if (!user) return "The customer is not logged in, so no booking can be made. Ask them to log in first.";
    const { date, start_hour, duration, payment_method } = input;
    if (!date || !start_hour || !duration || !payment_method) return "Missing booking details. Ask the customer for the date, start time, duration, and payment method.";

    const start = parseInt(start_hour);
    const end = start + parseInt(duration);
    const okMorning = start >= 6 && end <= 9;
    const okEvening = start >= 17 && end <= 22;
    if (!okMorning && !okEvening) return "That booking is outside operating hours (6:00-9:00 AM and 5:00-10:00 PM). Suggest a valid time.";

    const [existing] = await db.query("SELECT start_time, end_time FROM bookings WHERE booking_date = ? AND status != 'cancelled'", [date]);
    for (let h = start; h < end; h++) {
        const taken = existing.some(b => h >= parseInt(b.start_time.slice(0, 2)) && h < parseInt(b.end_time.slice(0, 2)));
        if (taken) return "One of those hours is already reserved. Tell the customer that time is taken and offer another slot.";
    }

    const start_time = `${String(start).padStart(2, "0")}:00:00`;
    const end_time = `${String(end).padStart(2, "0")}:00:00`;
    await db.query("INSERT INTO bookings (user_id, booking_date, start_time, end_time, payment_method) VALUES (?, ?, ?, ?, ?)", [user.id, date, start_time, end_time, payment_method]);

    const total = parseInt(duration) * 150;
    return `Booking created for ${date}, ${chatFormatHour(start)} to ${chatFormatHour(end)}, ${duration} hour(s), total P${total}, paid by ${payment_method}. Status is Pending Payment. Confirm this to the customer.`;
}

const chatTools = [
    {
        name: "check_availability",
        description: "Check which one-hour slots are available, reserved, open play, or unavailable for a given date. Operating hours are 6:00-9:00 AM and 5:00-10:00 PM daily.",
        input_schema: {
            type: "object",
            properties: {
                date: { type: "string", description: "The date to check in YYYY-MM-DD format" }
            },
            required: ["date"]
        }
    },
    {
        name: "create_booking",
        description: "Create a court reservation for the logged-in customer. Only call after confirming the date, start time, duration, and payment method with the customer.",
        input_schema: {
            type: "object",
            properties: {
                date: { type: "string", description: "Booking date in YYYY-MM-DD format" },
                start_hour: { type: "integer", description: "Start hour in 24-hour time. Valid values: 6, 7, 8 for morning and 17, 18, 19, 20, 21 for evening" },
                duration: { type: "integer", description: "Number of hours from 1 to 5" },
                payment_method: { type: "string", enum: ["ewallet", "cash"], description: "How the customer will pay" }
            },
            required: ["date", "start_hour", "duration", "payment_method"]
        }
    }
];

const chatSystemPrompt = `You are the friendly booking assistant for a pickleball court reservation website.
Court reservations cost 150 pesos per hour. Open play is 100 pesos per head. Operating hours are 6:00 to 9:00 in the morning and 5:00 to 10:00 in the evening, every day.
You can check availability and create bookings using your tools. A booking can only be made for a customer who is logged in.
Always confirm the date, start time, duration, and payment method with the customer before creating a booking. Keep replies short and friendly. Only answer questions about this pickleball court and its bookings. Today's date is ${new Date().toISOString().slice(0, 10)}.`;

app.post("/api/chat", async (req, res) => {
    const message = req.body.message;
    if (!message) return res.status(400).json({ error: "Message is required" });

    if (!req.session.chatHistory) req.session.chatHistory = [];
    req.session.chatHistory.push({ role: "user", content: message });

    try {
        let response;
        while (true) {
            response = await anthropic.messages.create({
                model: "claude-opus-4-8",
                max_tokens: 1024,
                system: chatSystemPrompt,
                tools: chatTools,
                messages: req.session.chatHistory
            });

            req.session.chatHistory.push({ role: "assistant", content: response.content });

            if (response.stop_reason !== "tool_use") break;

            const toolResults = [];
            for (const block of response.content) {
                if (block.type === "tool_use") {
                    let result;
                    if (block.name === "check_availability") {
                        result = await chatCheckAvailability(block.input.date);
                    } else if (block.name === "create_booking") {
                        result = await chatCreateBooking(req.session.user, block.input);
                    } else {
                        result = "Unknown tool.";
                    }
                    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
                }
            }
            req.session.chatHistory.push({ role: "user", content: toolResults });
        }

        const reply = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
        res.json({ reply });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "The assistant is unavailable right now. Please try again." });
    }
});

app.post("/api/bookings/:id/reschedule", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

    const { date, start_hour } = req.body;
    if (!date || !start_hour) return res.status(400).json({ error: "New date and start time are required" });

    const [rows] = await db.query(
        `SELECT TIMESTAMPDIFF(MINUTE, NOW(), TIMESTAMP(booking_date, start_time)) AS minutes_until,
                TIMESTAMPDIFF(HOUR, start_time, end_time) AS duration, status
         FROM bookings WHERE id = ? AND user_id = ?`,
        [req.params.id, req.session.user.id]
    );
    const booking = rows[0];
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.status === "cancelled") return res.status(400).json({ error: "This booking is cancelled" });
    if (booking.minutes_until <= 360) {
        return res.status(403).json({ error: "Cannot reschedule within 6 hours of the booking." });
    }

    const start = parseInt(start_hour);
    const end = start + booking.duration;
    const okMorning = start >= 6 && end <= 9;
    const okEvening = start >= 17 && end <= 22;
    if (!okMorning && !okEvening) return res.status(400).json({ error: "New time is outside operating hours." });

    const [existing] = await db.query(
        "SELECT start_time, end_time FROM bookings WHERE booking_date = ? AND status != 'cancelled' AND id != ?",
        [date, req.params.id]
    );
    for (let h = start; h < end; h++) {
        const taken = existing.some(b => h >= parseInt(b.start_time.slice(0, 2)) && h < parseInt(b.end_time.slice(0, 2)));
        if (taken) return res.status(409).json({ error: "That new slot is already taken." });
    }

    const start_time = `${String(start).padStart(2, "0")}:00:00`;
    const end_time = `${String(end).padStart(2, "0")}:00:00`;
    await db.query("UPDATE bookings SET booking_date = ?, start_time = ?, end_time = ? WHERE id = ?",
        [date, start_time, end_time, req.params.id]);
    res.json({ success: true });
});

function requireAdmin(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
    if (req.session.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
    next();
}

app.get("/api/admin/bookings", requireAdmin, async (req, res) => {
    const date = req.query.date;
    let sql = `SELECT b.id, DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
                      b.start_time, b.end_time, b.payment_method, b.payment_status,
                      b.ewallet_reference, b.status, b.walk_in_name,
                      u.first_name, u.last_name
               FROM bookings b LEFT JOIN users u ON b.user_id = u.id`;
    const params = [];
    if (date) { sql += " WHERE b.booking_date = ?"; params.push(date); }
    sql += " ORDER BY b.booking_date DESC, b.start_time";
    const [rows] = await db.query(sql, params);
    res.json(rows);
});

app.post("/api/admin/bookings", requireAdmin, async (req, res) => {
    const { walk_in_name, date, start_hour, duration, payment_method } = req.body;
    if (!walk_in_name || !date || !start_hour || !duration || !payment_method) {
        return res.status(400).json({ error: "All fields are required" });
    }
    const start = parseInt(start_hour);
    const end = start + parseInt(duration);
    const okMorning = start >= 6 && end <= 9;
    const okEvening = start >= 17 && end <= 22;
    if (!okMorning && !okEvening) return res.status(400).json({ error: "Outside operating hours" });

    const [existing] = await db.query(
        "SELECT start_time, end_time FROM bookings WHERE booking_date = ? AND status != 'cancelled'", [date]);
    for (let h = start; h < end; h++) {
        const taken = existing.some(b => h >= parseInt(b.start_time.slice(0, 2)) && h < parseInt(b.end_time.slice(0, 2)));
        if (taken) return res.status(409).json({ error: "That slot is already taken" });
    }

    const start_time = `${String(start).padStart(2, "0")}:00:00`;
    const end_time = `${String(end).padStart(2, "0")}:00:00`;
    await db.query(
        "INSERT INTO bookings (user_id, walk_in_name, booking_date, start_time, end_time, payment_method) VALUES (NULL, ?, ?, ?, ?, ?)",
        [walk_in_name, date, start_time, end_time, payment_method]);
    res.json({ success: true });
});

app.post("/api/admin/bookings/:id/pay", requireAdmin, async (req, res) => {
    const reference = req.body.reference || null;
    const [result] = await db.query(
        "UPDATE bookings SET payment_status = 'paid', status = 'confirmed', ewallet_reference = ? WHERE id = ? AND status != 'cancelled'",
        [reference, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Booking not found or cancelled" });
    res.json({ success: true });
});

app.post("/api/admin/bookings/:id/cancel", requireAdmin, async (req, res) => {
    await db.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
});

app.get("/api/admin/openplay", requireAdmin, async (req, res) => {
    const [rows] = await db.query(
        `SELECT id, DATE_FORMAT(session_date, '%Y-%m-%d') AS session_date,
                start_time, end_time, attendance_count, per_head_fee, total_collected
         FROM open_play_sessions ORDER BY session_date DESC`);
    res.json(rows);
});

app.post("/api/admin/openplay", requireAdmin, async (req, res) => {
    const { date, start_hour, duration } = req.body;
    if (!date || !start_hour || !duration) return res.status(400).json({ error: "All fields are required" });
    const start = parseInt(start_hour);
    const end = start + parseInt(duration);
    const start_time = `${String(start).padStart(2, "0")}:00:00`;
    const end_time = `${String(end).padStart(2, "0")}:00:00`;
    await db.query(
        "INSERT INTO open_play_sessions (session_date, start_time, end_time) VALUES (?, ?, ?)",
        [date, start_time, end_time]);
    res.json({ success: true });
});

app.post("/api/admin/openplay/:id/log", requireAdmin, async (req, res) => {
    const attendees = parseInt(req.body.attendees);
    if (!attendees || attendees < 0) return res.status(400).json({ error: "Attendee count is required" });
    await db.query(
        "UPDATE open_play_sessions SET attendance_count = ?, total_collected = ? * per_head_fee WHERE id = ?",
        [attendees, attendees, req.params.id]);
    res.json({ success: true });
});

app.get("/api/admin/blocked", requireAdmin, async (req, res) => {
    const [rows] = await db.query(
        `SELECT id, DATE_FORMAT(blocked_date, '%Y-%m-%d') AS blocked_date, start_time, end_time, reason
         FROM blocked_slots ORDER BY blocked_date DESC`);
    res.json(rows);
});

app.post("/api/admin/blocked", requireAdmin, async (req, res) => {
    const { date, start_hour, duration, reason } = req.body;
    if (!date || !start_hour || !duration || !reason) return res.status(400).json({ error: "All fields are required" });
    const start = parseInt(start_hour);
    const end = start + parseInt(duration);
    const start_time = `${String(start).padStart(2, "0")}:00:00`;
    const end_time = `${String(end).padStart(2, "0")}:00:00`;
    await db.query(
        "INSERT INTO blocked_slots (blocked_date, start_time, end_time, reason) VALUES (?, ?, ?, ?)",
        [date, start_time, end_time, reason]);
    res.json({ success: true });
});

app.delete("/api/admin/blocked/:id", requireAdmin, async (req, res) => {
    await db.query("DELETE FROM blocked_slots WHERE id = ?", [req.params.id]);
    res.json({ success: true });
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const [rows] = await db.query(
        "SELECT id, email, first_name, last_name, contact_number, is_active FROM users WHERE role = 'player' ORDER BY id");
    res.json(rows);
});

app.post("/api/admin/users/:id/toggle", requireAdmin, async (req, res) => {
    await db.query("UPDATE users SET is_active = NOT is_active WHERE id = ? AND role = 'player'", [req.params.id]);
    res.json({ success: true });
});

app.get("/api/admin/reports", requireAdmin, async (req, res) => {
    const period = req.query.period || "week";
    const days = period === "day" ? 1 : period === "month" ? 30 : 7;

    const [[bookingStats]] = await db.query(
        `SELECT COUNT(*) AS total,
                SUM(status = 'cancelled') AS cancelled,
                SUM(CASE WHEN payment_status = 'paid' THEN TIMESTAMPDIFF(HOUR, start_time, end_time) * 150 ELSE 0 END) AS revenue
         FROM bookings WHERE booking_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`, [days]);

    const [byMethod] = await db.query(
        `SELECT payment_method, COUNT(*) AS count
         FROM bookings WHERE booking_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND status != 'cancelled'
         GROUP BY payment_method`, [days]);

    const [[openPlayStats]] = await db.query(
        `SELECT COALESCE(SUM(attendance_count), 0) AS attendees, COALESCE(SUM(total_collected), 0) AS income
         FROM open_play_sessions WHERE session_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`, [days]);

    res.json({
        period,
        bookings: bookingStats.total,
        cancelled: bookingStats.cancelled || 0,
        booking_revenue: bookingStats.revenue || 0,
        by_method: byMethod,
        open_play_attendees: openPlayStats.attendees,
        open_play_income: openPlayStats.income
    });
});

setInterval(async () => {
    try {
        await db.query(
            `UPDATE bookings SET status = 'cancelled'
             WHERE payment_method = 'ewallet' AND payment_status = 'unpaid' AND status = 'pending'
             AND TIMESTAMPDIFF(MINUTE, NOW(), TIMESTAMP(booking_date, start_time)) <= 180`);
    } catch (error) {
        console.error("Auto-cancel check failed:", error.message);
    }
}, 60000);

app.listen(3000, () => {
    console.log("Server is running at http://localhost:3000");
});
