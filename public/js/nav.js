async function updateNav() {
    const response = await fetch("/api/me");
    if (!response.ok) return;

    const user = await response.json();
    const navLinks = document.querySelector(".navbar__links");

    navLinks.innerHTML = `
        <a href="/">Home</a>
        <a href="/calendar.html">Book a Court</a>
        <a href="/my-bookings.html">My Bookings</a>
        <a href="/chat.html">Chat</a>
        <a href="/api/auth/logout" class="btn btn--light">Log Out</a>
    `;
}
updateNav();