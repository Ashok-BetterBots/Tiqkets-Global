(function () {
  "use strict";
  var formId = location.pathname.split("/").filter(Boolean).pop();
  var mount = document.getElementById("form-root");
  var status = document.getElementById("form-status");
  var language = "en";
  var renderer;

  function notice(message, kind) {
    status.textContent = message || "";
    status.className = "fb-status " + (kind || "");
  }

  function load() {
    fetch("/api/experimental/form-builder/public/" + encodeURIComponent(formId), { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("This form is unavailable.");
        return response.json();
      })
      .then(function (payload) {
        var form = payload.form;
        document.title = form.formName + " · Experimental form";
        document.getElementById("form-title").textContent = form.formName;
        renderer = new window.ExperimentalFormRenderer.FormRenderer({
          schema: form.schema,
          mount: mount,
          language: language,
          onPopup: function (title, message) {
            document.getElementById("popup-title").textContent = title;
            document.getElementById("popup-message").textContent = message;
            document.getElementById("popup").classList.add("open");
          },
          onSubmit: function (answers) {
            notice("Submitting…");
            fetch("/api/experimental/form-builder/submissions/" + encodeURIComponent(form.id), {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ answers: answers })
            }).then(function (response) {
              return response.json().then(function (body) { return { ok: response.ok, body: body }; });
            }).then(function (result) {
              if (!result.ok) throw new Error(result.body.error || "Please correct the form.");
              notice(window.ExperimentalFormRenderer.textFor(result.body.message, language) || "Registration submitted successfully.", "success");
            }).catch(function (error) { notice(error.message, "error"); });
          }
        });
      })
      .catch(function (error) { notice(error.message, "error"); });
  }

  document.getElementById("language-en").addEventListener("click", function () {
    language = "en"; if (renderer) renderer.setLanguage(language);
  });
  document.getElementById("language-ta").addEventListener("click", function () {
    language = "ta"; if (renderer) renderer.setLanguage(language);
  });
  document.getElementById("popup-close").addEventListener("click", function () {
    document.getElementById("popup").classList.remove("open");
  });
  load();
})();