/* HYPOTEQ website: sends the contact, partner and newsletter forms (form[data-form]) to the
   site's APIs. The browser checks the required fields first; the answer shows the form's
   .form-ok or .form-err line. */
(function () {
  var d = document;
  var ENDPOINT = { contact: "/api/contact", partner: "/api/partner-contact", newsletter: "/api/newsletter" };

  function val(f, n) {
    var el = f.querySelector('[name="' + n + '"]');
    return el ? String(el.value || "").trim() : "";
  }

  /* The APIs take first and last name; the design asks for both in one field. */
  function names(full) {
    var parts = full.split(/\s+/).filter(Boolean);
    return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "–" };
  }

  function payload(kind, f) {
    if (kind === "newsletter") return { email: val(f, "email") };
    var n = names(val(f, "name"));
    var page = "\n\n— Website: " + location.pathname;
    if (kind === "partner") {
      var head = [];
      if (val(f, "company")) head.push("Firma: " + val(f, "company"));
      if (val(f, "type")) head.push("Ich bin: " + val(f, "type"));
      return {
        firstName: n.firstName, lastName: n.lastName, email: val(f, "email"), phone: val(f, "phone"),
        message: (head.length ? head.join("\n") + "\n\n" : "") + val(f, "message") + page,
      };
    }
    return {
      firstName: n.firstName, lastName: n.lastName, email: val(f, "email"), phone: val(f, "phone"),
      company: "", inquiryType: "general", message: val(f, "message") + page,
    };
  }

  d.querySelectorAll("form[data-form]").forEach(function (f) {
    var kind = f.getAttribute("data-form"), url = ENDPOINT[kind];
    if (!url) return;
    var ok = f.querySelector(".form-ok"), err = f.querySelector(".form-err"), btn = f.querySelector('[type="submit"]');
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (f.getAttribute("aria-busy") === "true") return;
      f.setAttribute("aria-busy", "true");
      if (btn) btn.disabled = true;
      if (ok) ok.classList.remove("show");
      if (err) err.classList.remove("show");
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(kind, f)) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return r.ok && j && j.success; }); })
        .catch(function () { return false; })
        .then(function (sent) {
          f.removeAttribute("aria-busy");
          if (btn) btn.disabled = false;
          if (sent) {
            f.reset();
            f.querySelectorAll("input,textarea,select").forEach(function (i) { i.blur(); });
            if (ok) ok.classList.add("show");
          } else if (err) {
            err.classList.add("show");
          }
        });
    });
  });
})();
