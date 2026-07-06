const box = document.getElementById("bookings");

function formatTime(t) {
  const h = parseInt(t.slice(0, 2));
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h;
  return `${h12}:00 ${suffix}`;
}

async function loadBookings() {
  const res = await fetch("/api/bookings/mine");
  if (res.status === 401) { window.location.href = "/login.html"; return; }

  const bookings = await res.json();
  box.innerHTML = "";
  if (bookings.length === 0) {
    box.innerHTML = "<p>You have no bookings yet.</p>";
    return;
  }

  bookings.forEach(b => {
    const card = document.createElement("div");
    card.className = "booking-card";
    card.innerHTML = `
      <div>
        <strong>${b.booking_date}</strong> · ${formatTime(b.start_time)} – ${formatTime(b.end_time)}<br>
        <span class="muted">${b.payment_method} · ${b.payment_status} · ${b.status}</span>
      </div>
    `;

    if (b.status !== "cancelled" && b.status !== "completed") {
      if (b.minutes_until > 360) {
        const btn = document.createElement("button");
        btn.textContent = "Cancel";
        btn.className = "btn-cancel-booking";
        btn.addEventListener("click", () => cancelBooking(b.id));
        card.appendChild(btn);
      } else {
        const note = document.createElement("span");
        note.className = "muted";
        note.textContent = "Starts in ≤6 hours — contact the admin to change";
        card.appendChild(note);
      }
    }
    box.appendChild(card);
  });
}

async function cancelBooking(id) {
  if (!confirm("Cancel this booking?")) return;
  const res = await fetch(`/api/bookings/${id}/cancel`, { method: "POST" });
  const result = await res.json();
  if (!res.ok) { alert(result.error || "Could not cancel."); return; }
  loadBookings();
}

loadBookings();