const dateInput = document.getElementById("date");
const slotsBox = document.getElementById("slots");
const modal = document.getElementById("booking-modal");
const modalSlot = document.getElementById("modal-slot");
const modalSummary = document.getElementById("modal-summary");
const durationSelect = document.getElementById("duration");
const paymentSelect = document.getElementById("payment");

let selectedHour = null;
const RATE = 150;

dateInput.value = new Date().toISOString().slice(0, 10);

async function loadSlots() {
  const date = dateInput.value;
  const response = await fetch(`/api/availability?date=${date}`);
  const data = await response.json();

  slotsBox.innerHTML = "";
  data.slots.forEach(slot => {
    const label = formatHour(slot.hour);
    const chip = document.createElement("div");
    chip.className = `slot slot--${slot.status}`;
    chip.textContent = slot.status === "available" ? label : `${label} (${slot.status})`;
    if (slot.status === "available") {
      chip.addEventListener("click", () => openModal(slot.hour));
    }
    slotsBox.appendChild(chip);
  });
}

function formatHour(h) {
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h > 12 ? h - 12 : h;
  return `${hour12}:00 ${suffix}`;
}

function openModal(hour) {
  selectedHour = hour;
  modalSlot.textContent = `${dateInput.value} — starting ${formatHour(hour)}`;
  updateSummary();
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  selectedHour = null;
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
      booking_date: dateInput.value,
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
dateInput.addEventListener("change", loadSlots);
loadSlots();