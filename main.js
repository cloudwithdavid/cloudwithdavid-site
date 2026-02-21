(function () {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const btn = document.getElementById("menuBtn");
  const mobile = document.getElementById("mobileNav");

  if (btn && mobile) {
    btn.addEventListener("click", () => {
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!isOpen));
      mobile.hidden = isOpen;
    });

    // close mobile menu when clicking a link
    mobile.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        btn.setAttribute("aria-expanded", "false");
        mobile.hidden = true;
      });
    });
  }
})();