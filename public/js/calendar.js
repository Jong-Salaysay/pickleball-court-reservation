const dateInput = document.getElementById("date");
const slotsBox = document.getElementById("slots");

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
        slotsBox.appendChild(chip);
    });
}
function formatHour(h) {
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = h > 12 ? h - 12 : h;
    return `${hour12}:00 ${suffix}`;
}

dateInput.addEventListener("change", loadSlots);
loadSlots();