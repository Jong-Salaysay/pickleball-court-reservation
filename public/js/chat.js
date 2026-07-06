const chatBox = document.getElementById("chat-box");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

function addMessage(text, sender) {
    const bubble = document.createElement("div");
    bubble.className = `bubble bubble--${sender}`;
    bubble.textContent = text;
    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
}

addMessage("Hi! I can check court availability, rates, and book a slot for you. What do you need?", "bot");

chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    addMessage(message, "user");
    chatInput.value = "";

    const typing = document.createElement("div");
    typing.className = "bubble bubble--bot";
    typing.textContent = "...";
    chatBox.appendChild(typing);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message })
        });
        const data = await res.json();
        typing.remove();
        addMessage(data.reply || data.error || "Sorry, something went wrong.", "bot");
    } catch (err) {
        typing.remove();
        addMessage("Could not reach the assistant. Please try again.", "bot");
    }
});
