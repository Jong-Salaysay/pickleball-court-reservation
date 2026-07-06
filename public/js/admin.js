function formatTime(t) {
    const h = parseInt(t.slice(0, 2));
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h > 12 ? h - 12 : h;
    return `${h12}:00 ${suffix}`;
}

async function guardAdmin() {
    const res = await fetch("/api/me");
    if (!res.ok) { window.location.href = "/login.html"; return false; }
    const user = await res.json();
    if (user.role !== "admin") { window.location.href = "/"; return false; }
    return true;
}

document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("admin-tab--active"));
        tab.classList.add("admin-tab--active");
        document.querySelectorAll(".admin-section").forEach(s => s.classList.add("hidden"));
        document.getElementById(`section-${tab.dataset.section}`).classList.remove("hidden");
        if (tab.dataset.section === "bookings") loadBookings();
        if (tab.dataset.section === "openplay") loadOpenPlay();
        if (tab.dataset.section === "schedule") loadBlocked();
        if (tab.dataset.section === "users") loadUsers();
        if (tab.dataset.section === "reports") loadReport();
    });
});

async function loadBookings(date) {
    const url = date ? `/api/admin/bookings?date=${date}` : "/api/admin/bookings";
    const res = await fetch(url);
    const bookings = await res.json();
    const box = document.getElementById("bookings-list");
    box.innerHTML = bookings.length ? "" : "<p>No bookings found.</p>";

    bookings.forEach(b => {
        const name = b.walk_in_name ? `${b.walk_in_name} (walk-in)` : `${b.first_name} ${b.last_name}`;
        const card = document.createElement("div");
        card.className = "admin-card";
        card.innerHTML = `
            <div>
                <strong>${name}</strong><br>
                ${b.booking_date} · ${formatTime(b.start_time)} – ${formatTime(b.end_time)}<br>
                <span class="muted">${b.payment_method} · ${b.payment_status} · ${b.status}${b.ewallet_reference ? " · ref: " + b.ewallet_reference : ""}</span>
            </div>
        `;
        const actions = document.createElement("div");
        actions.className = "admin-card__actions";

        if (b.status !== "cancelled" && b.payment_status === "unpaid") {
            const payBtn = document.createElement("button");
            payBtn.textContent = "Record Payment";
            payBtn.className = "btn btn--primary btn--small";
            payBtn.addEventListener("click", async () => {
                let reference = null;
                if (b.payment_method === "ewallet") {
                    reference = prompt("Enter the GCash reference number:");
                    if (reference === null) return;
                }
                await fetch(`/api/admin/bookings/${b.id}/pay`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reference })
                });
                loadBookings(date);
            });
            actions.appendChild(payBtn);
        }

        if (b.status !== "cancelled") {
            const cancelBtn = document.createElement("button");
            cancelBtn.textContent = "Cancel";
            cancelBtn.className = "btn-cancel-booking btn--small";
            cancelBtn.addEventListener("click", async () => {
                if (!confirm(`Cancel this booking for ${name}?`)) return;
                await fetch(`/api/admin/bookings/${b.id}/cancel`, { method: "POST" });
                loadBookings(date);
            });
            actions.appendChild(cancelBtn);
        }

        card.appendChild(actions);
        box.appendChild(card);
    });
}

document.getElementById("bookings-filter").addEventListener("click", () => {
    const date = document.getElementById("bookings-date").value;
    if (date) loadBookings(date);
});
document.getElementById("bookings-all").addEventListener("click", () => loadBookings());

document.getElementById("walkin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            walk_in_name: document.getElementById("walkin-name").value,
            date: document.getElementById("walkin-date").value,
            start_hour: document.getElementById("walkin-hour").value,
            duration: document.getElementById("walkin-duration").value,
            payment_method: document.getElementById("walkin-payment").value
        })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not add booking"); return; }
    event.target.reset();
    loadBookings();
});

async function loadOpenPlay() {
    const res = await fetch("/api/admin/openplay");
    const sessions = await res.json();
    const box = document.getElementById("openplay-list");
    box.innerHTML = sessions.length ? "" : "<p>No open play sessions yet.</p>";

    sessions.forEach(s => {
        const card = document.createElement("div");
        card.className = "admin-card";
        card.innerHTML = `
            <div>
                <strong>${s.session_date}</strong> · ${formatTime(s.start_time)} – ${formatTime(s.end_time)}<br>
                <span class="muted">${s.attendance_count} attendees · P${s.per_head_fee}/head · collected P${s.total_collected}</span>
            </div>
        `;
        const logBtn = document.createElement("button");
        logBtn.textContent = "Log Attendance";
        logBtn.className = "btn btn--primary btn--small";
        logBtn.addEventListener("click", async () => {
            const attendees = prompt("How many attendees?");
            if (attendees === null || attendees === "") return;
            await fetch(`/api/admin/openplay/${s.id}/log`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ attendees })
            });
            loadOpenPlay();
        });
        card.appendChild(logBtn);
        box.appendChild(card);
    });
}

document.getElementById("openplay-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const res = await fetch("/api/admin/openplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            date: document.getElementById("openplay-date").value,
            start_hour: document.getElementById("openplay-hour").value,
            duration: document.getElementById("openplay-duration").value
        })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not create session"); return; }
    event.target.reset();
    loadOpenPlay();
});

async function loadBlocked() {
    const res = await fetch("/api/admin/blocked");
    const blocks = await res.json();
    const box = document.getElementById("blocked-list");
    box.innerHTML = blocks.length ? "" : "<p>No blocked slots.</p>";

    blocks.forEach(b => {
        const card = document.createElement("div");
        card.className = "admin-card";
        card.innerHTML = `
            <div>
                <strong>${b.blocked_date}</strong> · ${formatTime(b.start_time)} – ${formatTime(b.end_time)}<br>
                <span class="muted">${b.reason}</span>
            </div>
        `;
        const unblockBtn = document.createElement("button");
        unblockBtn.textContent = "Unblock";
        unblockBtn.className = "btn-cancel-booking btn--small";
        unblockBtn.addEventListener("click", async () => {
            await fetch(`/api/admin/blocked/${b.id}`, { method: "DELETE" });
            loadBlocked();
        });
        card.appendChild(unblockBtn);
        box.appendChild(card);
    });
}

document.getElementById("blocked-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const res = await fetch("/api/admin/blocked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            date: document.getElementById("blocked-date").value,
            start_hour: document.getElementById("blocked-hour").value,
            duration: document.getElementById("blocked-duration").value,
            reason: document.getElementById("blocked-reason").value
        })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not block slots"); return; }
    event.target.reset();
    loadBlocked();
});

async function loadUsers() {
    const res = await fetch("/api/admin/users");
    const users = await res.json();
    const box = document.getElementById("users-list");
    box.innerHTML = users.length ? "" : "<p>No registered players.</p>";

    users.forEach(u => {
        const card = document.createElement("div");
        card.className = "admin-card";
        card.innerHTML = `
            <div>
                <strong>${u.first_name} ${u.last_name}</strong><br>
                <span class="muted">${u.email} · ${u.contact_number} · ${u.is_active ? "Active" : "Deactivated"}</span>
            </div>
        `;
        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = u.is_active ? "Deactivate" : "Reactivate";
        toggleBtn.className = u.is_active ? "btn-cancel-booking btn--small" : "btn btn--primary btn--small";
        toggleBtn.addEventListener("click", async () => {
            await fetch(`/api/admin/users/${u.id}/toggle`, { method: "POST" });
            loadUsers();
        });
        card.appendChild(toggleBtn);
        box.appendChild(card);
    });
}

async function loadReport() {
    const period = document.getElementById("report-period").value;
    const res = await fetch(`/api/admin/reports?period=${period}`);
    const r = await res.json();
    const methods = r.by_method.map(m => `${m.payment_method}: ${m.count}`).join(" · ") || "none";
    document.getElementById("report-stats").innerHTML = `
        <div class="stat-card"><span class="stat-card__number">${r.bookings}</span><span class="stat-card__label">Bookings</span></div>
        <div class="stat-card"><span class="stat-card__number">${r.cancelled}</span><span class="stat-card__label">Cancelled</span></div>
        <div class="stat-card"><span class="stat-card__number">P${r.booking_revenue}</span><span class="stat-card__label">Booking Revenue</span></div>
        <div class="stat-card"><span class="stat-card__number">${r.open_play_attendees}</span><span class="stat-card__label">Open Play Heads</span></div>
        <div class="stat-card"><span class="stat-card__number">P${r.open_play_income}</span><span class="stat-card__label">Open Play Income</span></div>
        <p class="muted">Payment methods: ${methods}</p>
    `;
}

document.getElementById("report-load").addEventListener("click", loadReport);

guardAdmin().then(ok => {
    if (ok) loadBookings();
});
