const form = document.querySelector("form");
const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirm-password");

confirmPassword.addEventListener("input", () => {
    confirmPassword.setCustomValidity("");
});

form.addEventListener("submit", (event) => {
    if (password.value !== confirmPassword.value) {
    event.preventDefault();
    confirmPassword.setCustomValidity("Passwords do not match");
    confirmPassword.reportValidity();
    }

});