const slotsBox = document.getElementById("slots");
const modal = document.getElementById("booking-modal");
const modalSlot = document.getElementById("modal-slot");
const modalSummary = document.getElementById("modal-summary");
const durationSelect = document.getElementById("duration");
const paymentSelect = document.getElementById("payment");

let selectedHour = null;
let selectedDate = null;
const RATE = 150;

function dateString(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function loadSlots() {
  slotsBox.innerHTML = "";
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const results = await Promise.all(
    days.map(d => fetch(`/api/availability?date=${dateString(d)}`).then(r => r.json()))
  );

  results.forEach((data, i) => {
    const col = document.createElement("div");
    col.className = "day-col";

    const head = document.createElement("div");
    head.className = "day-col__head";
    head.textContent = days[i].toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    col.appendChild(head);

    data.slots.forEach(slot => {
      const chip = document.createElement("div");
      chip.className = `slot slot--${slot.status}`;
      chip.textContent = formatHour(slot.hour);
      chip.title = slot.status.replace("_", " ");
      if (slot.status === "available") {
        chip.addEventListener("click", () => openModal(data.date, slot.hour));
      }
      col.appendChild(chip);
    });

    slotsBox.appendChild(col);
  });
}

function formatHour(h) {
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h > 12 ? h - 12 : h;
  return `${hour12}:00 ${suffix}`;
}

function openModal(date, hour) {
  selectedDate = date;
  selectedHour = hour;
  modalSlot.textContent = `${date} — starting ${formatHour(hour)}`;
  updateSummary();
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  selectedHour = null;
  selectedDate = null;
}

function updateSummary() {
  const duration = parseInt(durationSelect.value);
  const end = selectedHour + duration;
  const total = duration * RATE;
  modalSummary.textContent =
    `${formatHour(selectedHour)} – ${formatHour(end)} · ${duration} hour(s) · ₱${total}`;
}

async function confirmBooking() {
  const response = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      booking_date: selectedDate,
      start_hour: selectedHour,
      duration: parseInt(durationSelect.value),
      payment_method: paymentSelect.value
    })
  });

  if (response.status === 401) {
    window.location.href = "/login.html";
    return;
  }

  const result = await response.json();
  if (!response.ok) {
    alert(result.error || "Booking failed.");
    return;
  }

  closeModal();
  loadSlots();
  alert("Booking received! Check My Bookings.");
}

durationSelect.addEventListener("change", updateSummary);
document.getElementById("confirm-booking").addEventListener("click", confirmBooking);
document.getElementById("cancel-booking").addEventListener("click", closeModal);
loadSlots();
