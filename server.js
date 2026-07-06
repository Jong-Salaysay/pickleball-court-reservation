const express = require("express");
const db = require("./db/db");
const app = express();
const bcrypt = require("bcryptjs");
const session = require("express-session");

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

app.listen(3000, () =>{
    console.log("Server is running at http://localhost:3000");
});

app.post("/api/auth/register", async (req, res) => {
    console.log(req.body);
    const { first_name, last_name, email, contact_number, password, confirm_password } = req.body;

    if (!first_name || !last_name || !email || !contact_number || !password) {
    return res.status(400).send({ error: "All fields are required" });
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

    req.session.userId = {
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
    if (!req.session.userId) {
        return res.status(401).json("Not logged in");
    }
    res.json(req.session.userId);
});
app.get("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});
