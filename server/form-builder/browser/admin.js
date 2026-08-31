(function () {
  "use strict";
  var state = {
    clients: [],
    configs: [],
    clientId: "",
    configId: "",
    formName: "Untitled registration form",
    isActive: false,
    schema: { version: 1, fields: [], settings: { submitLabel: "Submit registration", successMessage: "Registration submitted successfully." } }
  };
  var els = {
    clients: document.getElementById("client-select"),
    configs: document.getElementById("config-select"),
    formName: document.getElementById("form-name"),
    active: document.getElementById("form-active"),
    fields: document.getElementById("fields"),
    preview: document.getElementById("preview"),
    message: document.getElementById("builder-message"),
    json: document.getElementById("schema-json")
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }
  function labelValue(value, language) {
    if (!value) return "";
    return typeof value === "string" ? value : value[language] || "";
  }
  function setMessage(text, kind) {
    els.message.textContent = text || "";
    els.message.className = "fb-status " + (kind || "");
  }
  function defaultField(type, order) {
    var labels = {
      label: "Notice", text: "Short text", textarea: "Long text", dropdown: "Choose one",
      radio_icon: "Choose one", checkbox_icon: "Choose all that apply", image: "Upload image",
      date: "Date", time: "Time", phone: "Phone number", email: "Email address",
      currency: "Amount", number: "Number", toggle: "Confirmation"
    };
    var field = { id: type + "_" + Date.now().toString(36), type: type, label: { en: labels[type], ta: "" }, required: false, order: order };
    if (["dropdown", "radio_icon", "checkbox_icon"].indexOf(type) !== -1) {
      field.options = [{ value: "option_1", label: { en: "Option 1", ta: "" }, icon: type === "dropdown" ? "" : "●" }];
    }
    if (type === "image") field.acceptUpload = true;
    return field;
  }
  function optionsText(field) {
    return (field.options || []).map(function (option) {
      return [option.value, labelValue(option.label, "en"), labelValue(option.label, "ta"), option.icon || ""].join(" | ");
    }).join("\n");
  }
  function parseOptions(text, withIcons) {
    return text.split("\n").map(function (line) {
      var parts = line.split("|").map(function (part) { return part.trim(); });
      if (!parts[0]) return null;
      var option = { value: parts[0], label: { en: parts[1] || parts[0], ta: parts[2] || "" } };
      if (withIcons) option.icon = parts[3] || "●";
      return option;
    }).filter(Boolean);
  }
  function ruleHtml(field) {
    var rule = field.rules && field.rules[0];
    if (!rule) return '<div class="rule-empty">No rule attached. Add one below.</div>';
    var payload = rule.actionPayload || {};
    return '<div class="rule-grid">' +
      '<select data-rule-key="trigger"><option ' + (rule.trigger === "onChange" ? "selected" : "") + ' value="onChange">onChange</option><option ' + (rule.trigger === "onSubmit" ? "selected" : "") + ' value="onSubmit">onSubmit</option><option ' + (rule.trigger === "onLoad" ? "selected" : "") + ' value="onLoad">onLoad</option></select>' +
      '<select data-rule-key="condition"><option value="equals" ' + (rule.condition === "equals" ? "selected" : "") + '>equals</option><option value="not_equals" ' + (rule.condition === "not_equals" ? "selected" : "") + '>not equals</option><option value="in" ' + (rule.condition === "in" ? "selected" : "") + '>in list</option><option value="not_in" ' + (rule.condition === "not_in" ? "selected" : "") + '>not in list</option><option value="is_empty" ' + (rule.condition === "is_empty" ? "selected" : "") + '>is empty</option><option value="greater_than" ' + (rule.condition === "greater_than" ? "selected" : "") + '>greater than</option></select>' +
      '<input data-rule-key="compareTo" value="' + esc(Array.isArray(rule.compareTo) ? JSON.stringify(rule.compareTo) : rule.compareTo || "") + '" placeholder="value or field ID">' +
      '<select data-rule-key="action"><option value="showPopup" ' + (rule.action === "showPopup" ? "selected" : "") + '>show popup</option><option value="showField" ' + (rule.action === "showField" ? "selected" : "") + '>show field</option><option value="hideField" ' + (rule.action === "hideField" ? "selected" : "") + '>hide field</option><option value="setRequired" ' + (rule.action === "setRequired" ? "selected" : "") + '>set required</option><option value="blockSubmit" ' + (rule.action === "blockSubmit" ? "selected" : "") + '>block submit</option></select>' +
      '<input data-rule-key="fieldId" value="' + esc(payload.fieldId || "") + '" placeholder="target field ID (optional)">' +
      '<input data-rule-key="message" value="' + esc(payload.message || "") + '" placeholder="popup/block message">' +
      '<button type="button" class="small danger" data-action="remove-rule">Remove rule</button></div>';
  }
  function renderFields() {
    els.fields.innerHTML = state.schema.fields.slice().sort(function (a, b) { return a.order - b.order; }).map(function (field, index) {
      var isOptions = ["dropdown", "radio_icon", "checkbox_icon"].indexOf(field.type) !== -1;
      return '<article class="field-card" data-field-id="' + esc(field.id) + '">' +
        '<div class="field-card-head"><div><span class="eyebrow">Field ' + (index + 1) + '</span><strong>' + esc(field.type) + '</strong></div><div class="field-actions"><button type="button" class="small" data-action="up">↑</button><button type="button" class="small" data-action="down">↓</button><button type="button" class="small danger" data-action="remove">Remove</button></div></div>' +
        '<div class="field-grid">' +
        '<label>Field ID<input data-key="id" value="' + esc(field.id) + '"></label>' +
        '<label>Type<select data-key="type">' + Object.keys(window.ExperimentalFormRenderer.FIELD_TYPES).map(function (type) { return '<option value="' + type + '" ' + (field.type === type ? "selected" : "") + '>' + window.ExperimentalFormRenderer.FIELD_TYPES[type] + ' (' + type + ')</option>'; }).join("") + '</select></label>' +
        '<label>English label<input data-key="label.en" value="' + esc(labelValue(field.label, "en")) + '"></label>' +
        '<label>Tamil label<input data-key="label.ta" value="' + esc(labelValue(field.label, "ta")) + '"></label>' +
        '<label class="check"><input type="checkbox" data-key="required" ' + (field.required ? "checked" : "") + '> Required</label>' +
        (field.type === "image" ? '<label>Image URL<input data-key="imageUrl" value="' + esc(field.imageUrl || "") + '" placeholder="https://..."></label><label class="check"><input type="checkbox" data-key="acceptUpload" ' + (field.acceptUpload ? "checked" : "") + '> Accept upload</label>' : "") +
        (isOptions ? '<label class="wide">Options <span class="hint">one per line: value | English | Tamil | icon</span><textarea data-key="options" rows="4">' + esc(optionsText(field)) + '</textarea></label>' : "") +
        '</div><div class="rule-box"><div class="rule-head"><strong>Rule</strong><button type="button" class="small" data-action="add-rule">Add rule</button></div>' + ruleHtml(field) + '</div></article>';
    }).join("") || '<div class="empty">Add a field from the palette to start building this form.</div>';
    els.json.textContent = JSON.stringify(state.schema, null, 2);
  }
  function syncField(card) {
    var field = state.schema.fields.find(function (item) { return item.id === card.dataset.fieldId; });
    if (!field) return;
    card.querySelectorAll("[data-key]").forEach(function (input) {
      var key = input.dataset.key;
      var value = input.type === "checkbox" ? input.checked : input.value;
      if (key === "options") {
        try {
          field.options = parseOptions(value, field.type !== "dropdown");
          delete input.dataset.invalid;
        } catch (_) { input.dataset.invalid = "true"; }
      } else if (key === "label.en" || key === "label.ta") {
        if (typeof field.label === "string") field.label = { en: field.label, ta: "" };
        field.label[key.slice(6)] = value;
      } else {
        field[key] = value;
      }
    });
    if (field.type !== "image") {
      delete field.imageUrl;
      delete field.acceptUpload;
    }
    if (field.type === "label") field.required = false;
  }
  function syncAll() {
    els.fields.querySelectorAll(".field-card").forEach(syncField);
    state.formName = els.formName.value.trim();
    state.isActive = els.active.checked;
  }
  function updateRule(card) {
    syncField(card);
    var field = state.schema.fields.find(function (item) { return item.id === card.dataset.fieldId; });
    if (!field) return;
    var values = {};
    card.querySelectorAll("[data-rule-key]").forEach(function (input) { values[input.dataset.ruleKey] = input.value; });
    var compareTo = values.compareTo || "";
    if ((values.condition === "in" || values.condition === "not_in") && compareTo) {
      try { compareTo = JSON.parse(compareTo); } catch (_) { compareTo = compareTo.split(",").map(function (v) { return v.trim(); }).filter(Boolean); }
    }
    field.rules = [{
      trigger: values.trigger,
      condition: values.condition,
      compareTo: compareTo,
      action: values.action,
      actionPayload: { fieldId: values.fieldId || undefined, message: values.message || undefined, title: values.message ? "Form notice" : undefined }
    }];
  }
  function newForm() {
    state.configId = "";
    state.formName = "Untitled registration form";
    state.isActive = false;
    state.schema = { version: 1, fields: [defaultField("text", 10)], settings: { submitLabel: "Submit registration", successMessage: "Registration submitted successfully." } };
    els.formName.value = state.formName;
    els.active.checked = false;
    renderFields();
    renderPreview();
    setMessage("New unsaved form");
  }
  function renderPreview() {
    syncAll();
    els.preview.innerHTML = "";
    new window.ExperimentalFormRenderer.FormRenderer({
      schema: state.schema,
      mount: els.preview,
      language: "en",
      onPopup: function (title, message) { window.alert(title + "\n\n" + message); },
      onSubmit: function () { setMessage("Preview only — save the form, then open its public preview URL.", "info"); }
    });
  }
  function api(url, options) {
    return fetch(url, Object.assign({ credentials: "same-origin" }, options || {})).then(function (response) {
      return response.json().then(function (body) { if (!response.ok) throw new Error(body.error || "Request failed"); return body; });
    });
  }
  function loadConfig(id) {
    if (!id) return newForm();
    api("/api/experimental/form-builder/configs/" + encodeURIComponent(id)).then(function (body) {
      var config = body.config;
      state.configId = config.id; state.clientId = config.clientId; state.formName = config.formName; state.isActive = config.isActive; state.schema = config.schema;
      els.formName.value = state.formName; els.active.checked = state.isActive; renderFields(); renderPreview(); setMessage("Loaded version " + config.version, "success");
    }).catch(function (error) { setMessage(error.message, "error"); });
  }
  function loadConfigs() {
    if (!state.clientId) return;
    api("/api/experimental/form-builder/configs?clientId=" + encodeURIComponent(state.clientId)).then(function (body) {
      state.configs = body.configs;
      els.configs.innerHTML = '<option value="">New form</option>' + state.configs.map(function (config) {
        return '<option value="' + esc(config.id) + '">' + esc(config.formName) + (config.isActive ? " · active" : "") + '</option>';
      }).join("");
      els.configs.value = state.configId || "";
    }).catch(function (error) { setMessage(error.message, "error"); });
  }
  function save() {
    syncAll();
    if (!state.clientId) return setMessage("Select a client first.", "error");
    if (!state.formName) return setMessage("Enter a form name.", "error");
    if (state.schema.fields.some(function (field) { return !field.id || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(field.id); })) return setMessage("Every field needs a unique ID starting with a letter.", "error");
    var method = state.configId ? "PUT" : "POST";
    var url = state.configId ? "/api/experimental/form-builder/configs/" + encodeURIComponent(state.configId) : "/api/experimental/form-builder/configs";
    api(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: state.clientId, formName: state.formName, schema: state.schema, isActive: state.isActive }) })
      .then(function (body) { state.configId = body.config.id; els.configs.value = state.configId; loadConfigs(); setMessage("Saved version " + body.config.version, "success"); })
      .catch(function (error) { setMessage(error.message, "error"); });
  }
  function addField(type) {
    syncAll();
    var maxOrder = state.schema.fields.reduce(function (max, field) { return Math.max(max, field.order || 0); }, 0);
    state.schema.fields.push(defaultField(type, maxOrder + 10));
    renderFields(); renderPreview();
  }

  els.clients.addEventListener("change", function () {
    state.clientId = els.clients.value; state.configId = ""; loadConfigs(); newForm();
  });
  els.configs.addEventListener("change", function () { loadConfig(els.configs.value); });
  els.formName.addEventListener("input", function () { state.formName = els.formName.value; });
  els.active.addEventListener("change", function () { state.isActive = els.active.checked; });
  document.querySelectorAll("[data-add-type]").forEach(function (button) { button.addEventListener("click", function () { addField(button.dataset.addType); }); });
  document.getElementById("new-form").addEventListener("click", newForm);
  document.getElementById("save-form").addEventListener("click", save);
  document.getElementById("preview-form").addEventListener("click", renderPreview);
  els.fields.addEventListener("input", function (event) {
    var card = event.target.closest(".field-card"); if (!card) return;
    syncField(card); els.json.textContent = JSON.stringify(state.schema, null, 2);
  });
  els.fields.addEventListener("change", function (event) {
    var card = event.target.closest(".field-card"); if (!card) return;
    if (event.target.dataset.ruleKey) updateRule(card);
    else syncField(card);
    renderFields(); renderPreview();
  });
  els.fields.addEventListener("click", function (event) {
    var button = event.target.closest("[data-action]"); var card = event.target.closest(".field-card");
    if (!button || !card) return;
    syncField(card);
    var field = state.schema.fields.find(function (item) { return item.id === card.dataset.fieldId; });
    var index = state.schema.fields.indexOf(field);
    if (button.dataset.action === "remove") state.schema.fields.splice(index, 1);
    if (button.dataset.action === "up" && index > 0) { var previous = state.schema.fields[index - 1].order; state.schema.fields[index - 1].order = field.order; field.order = previous; }
    if (button.dataset.action === "down" && index < state.schema.fields.length - 1) { var next = state.schema.fields[index + 1].order; state.schema.fields[index + 1].order = field.order; field.order = next; }
    if (button.dataset.action === "add-rule") field.rules = [{ trigger: "onChange", condition: "equals", compareTo: "", action: "showPopup", actionPayload: { message: "Please review this field." } }];
    if (button.dataset.action === "remove-rule") delete field.rules;
    renderFields(); renderPreview();
  });
  api("/api/experimental/form-builder/clients").then(function (body) {
    state.clients = body.clients;
    els.clients.innerHTML = '<option value="">Select a client</option>' + state.clients.map(function (client) {
      return '<option value="' + esc(client.id) + '">' + esc(client.name) + " · " + esc(client.email) + "</option>";
    }).join("");
    if (state.clients.length === 1) { state.clientId = state.clients[0].id; els.clients.value = state.clientId; loadConfigs(); }
  }).catch(function (error) { setMessage(error.message + " Sign in as an organization admin or super admin.", "error"); });
  renderFields();
  renderPreview();
})();