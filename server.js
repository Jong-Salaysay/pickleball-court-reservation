const express = require("express");
const db = require("./db/db");
const app = express();
const bcrypt = require("bcryptjs");
const session = require("express-session");
app.use(express.json());
app.use(express.static ("public"));
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

    if(!user || !user.is_active){
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
            const start = parseInt(item.start_time.slice (0,2));
            const end = parseInt(item.end_time.slice (0,2));
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

    res.json({date, slots});
})

app.post("/api/bookings", async (req, res) => {
    if (!req.session.user){
        return res.status(401).json({ error: "You must be logged in to book."})
    }

    const {booking_date, start_hour, duration, payment_method} = req.body;
        if (!booking_date || !start_hour || !duration || !payment_method){
            return res.status(400).json({error: "Missing booking details."});
        }
    const start = parseInt(start_hour);
    const end = start + parseInt(duration);
    const okMorning = start >=6 && end <=9;
    const okEvening = start>=17 && end <=22;
        if (!okMorning && !okEvening){
            return res.status(400).json({error: "Booking must stay within operating hours."});
        }
    const [existing] = await db.query(
        "SELECT start_time, end_time FROM bookings WHERE booking_date = ? AND status != 'cancelled'",
        [booking_date]
    );
        for (let h = start; h < end; h++){
            const taken = existing.some(b => h >= parseInt(b.start_time.slice(0, 2)) && h < parseInt(b.end_time.slice(0, 2))
        );
        if (taken) return res.status(409).json({error: "Sorry, that slot is taken."});
        }
    const start_time = `${String(start).padStart(2, "0")}:00:00`;
    const end_time = `${String(end).padStart(2, "0")}:00:00`;
    await db.query(
        "INSERT INTO bookings (user_id, booking_date, start_time, end_time, payment_method) VALUES (?, ?, ?, ?, ?)",
        [req.session.user.id, booking_date, start_time, end_time, payment_method]
    );
    res.json({success: true });
});


app.listen(3000, () =>{
    console.log("Server is running at http://localhost:3000");
});
