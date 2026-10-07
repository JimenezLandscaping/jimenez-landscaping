/* Lead forms: sends Elementor form submissions by email through FormSubmit.
   Replaces the old WordPress handler (/wp-admin/admin-ajax.php), which no longer exists. */
(function () {
  "use strict";
  var ENDPOINT = "https://formsubmit.co/ajax/rj1m3n3z2310@gmail.com";
  var SUBJECT = "New website lead: Jimenez Landscaping";
  var SUCCESS = "Thanks, we will get back to you shortly.";
  var ERROR = "Sorry, your message could not be sent. Please call us at (805) 444-9837.";

  function labelFor(form, el) {
    var text = el.getAttribute("placeholder") || "";
    if (!text && el.id) {
      var l = form.querySelector('label[for="' + el.id + '"]');
      if (l) text = l.textContent;
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function keyFor(el, label) {
    var l = label.toLowerCase();
    if (el.type === "email" || l.indexOf("email") > -1) return "email";
    if (el.type === "tel" || l.indexOf("phone") > -1 || /^\(?\d{3}\)?/.test(l)) return "phone";
    if (el.tagName === "TEXTAREA" || l.indexOf("message") > -1) return "message";
    if (l.indexOf("name") > -1) return "name";
    if (l.indexOf("address") > -1) return "address";
    return label || el.name || "field";
  }

  function collect(form) {
    var data = {};
    var services = [];
    var els = form.querySelectorAll("input, textarea, select");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.name || el.type === "hidden" || el.type === "submit" || el.name === "_honey") continue;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) {
          var lab = el.id ? form.querySelector('label[for="' + el.id + '"]') : null;
          services.push(lab ? lab.textContent.trim() : el.value);
        }
        continue;
      }
      var value = (el.value || "").trim();
      if (!value) continue;
      var key = keyFor(el, labelFor(form, el));
      data[key] = data[key] ? data[key] + " " + value : value;
    }
    if (services.length) data.services = services.join(", ");
    var title = form.querySelector('input[name="referer_title"]');
    data.page = document.title || (title ? title.value : "");
    data.page_url = window.location.href;
    data.form = form.getAttribute("name") || "";
    data._subject = SUBJECT;
    data._template = "table";
    data._captcha = "false";
    var honey = form.querySelector('input[name="_honey"]');
    data._honey = honey ? honey.value : "";
    if (data.email) data._replyto = data.email;
    return data;
  }

  function showMessage(form, ok, text) {
    var old = form.parentNode.querySelectorAll(".jl-form-message");
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    var div = document.createElement("div");
    div.className = "elementor-message jl-form-message " + (ok ? "elementor-message-success" : "elementor-message-danger");
    div.setAttribute("role", "alert");
    div.textContent = text;
    form.appendChild(div);
  }

  function addHoneypot(form) {
    if (form.querySelector('input[name="_honey"]')) return;
    var hp = document.createElement("input");
    hp.type = "text";
    hp.name = "_honey";
    hp.tabIndex = -1;
    hp.autocomplete = "off";
    hp.setAttribute("aria-hidden", "true");
    hp.style.cssText = "position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0";
    form.appendChild(hp);
  }

  function init() {
    var forms = document.querySelectorAll("form.elementor-form");
    for (var i = 0; i < forms.length; i++) addHoneypot(forms[i]);
  }

  // Capture phase on window runs before Elementor Pro's own submit handler,
  // so the old admin-ajax request is never made.
  window.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.classList || !form.classList.contains("elementor-form")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (form.getAttribute("data-jl-busy") === "1") return;
    addHoneypot(form);
    var btn = form.querySelector('button[type="submit"], input[type="submit"]');
    form.setAttribute("data-jl-busy", "1");
    form.classList.add("elementor-form-waiting");
    if (btn) btn.disabled = true;
    var payload = collect(form);
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok || String(d.success) === "false") throw new Error(d.message || "HTTP " + r.status);
          return d;
        });
      })
      .then(function () {
        showMessage(form, true, SUCCESS);
        form.reset();
      })
      .catch(function () { showMessage(form, false, ERROR); })
      .then(function () {
        form.removeAttribute("data-jl-busy");
        form.classList.remove("elementor-form-waiting");
        if (btn) btn.disabled = false;
      });
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
