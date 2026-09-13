(function () {
  "use strict";

  var FIELD_TYPES = {
    label: "Notice",
    text: "Short text",
    textarea: "Long text",
    dropdown: "Dropdown",
    radio_icon: "Single choice",
    checkbox_icon: "Multiple choice",
    image: "Image",
    date: "Date",
    time: "Time",
    phone: "Phone",
    email: "Email",
    currency: "Currency",
    number: "Number",
    toggle: "Yes / No"
  };

  function textFor(value, language) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value[language] || value.en || value.ta || "";
  }

  function empty(value) {
    return value === undefined || value === null || value === "" ||
      (Array.isArray(value) && value.length === 0);
  }

  function same(left, right) {
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every(function (v) { return right.indexOf(v) !== -1; });
    }
    return String(left == null ? "" : left) === String(right == null ? "" : right);
  }

  function compareValue(rule, answers) {
    if (typeof rule.compareTo === "string" &&
        Object.prototype.hasOwnProperty.call(answers, rule.compareTo)) {
      return answers[rule.compareTo];
    }
    return rule.compareTo;
  }

  function matches(rule, value, answers) {
    var target = compareValue(rule, answers);
    if (rule.condition === "equals") return same(value, target);
    if (rule.condition === "not_equals") return !empty(value) && !same(value, target);
    if (rule.condition === "in") return Array.isArray(target) && target.some(function (v) { return same(value, v); });
    if (rule.condition === "not_in") return !empty(value) && Array.isArray(target) && !target.some(function (v) { return same(value, v); });
    if (rule.condition === "is_empty") return empty(value);
    if (rule.condition === "greater_than") return Number(value) > Number(target);
    return false;
  }

  function optionLabel(option, language) {
    return textFor(option && option.label, language) || option.value || "";
  }

  function FormRenderer(options) {
    this.schema = options.schema || { version: 1, fields: [] };
    this.mountPoint = options.mount;
    this.language = options.language || "en";
    this.onSubmit = options.onSubmit || function () {};
    this.onPopup = options.onPopup || function (title, message) { window.alert((title ? title + "\n\n" : "") + message); };
    this.answers = {};
    this.requiredOverrides = {};
    this.visible = {};
    this.blocked = false;
    this.popupState = {};
    this.render();
  }

  FormRenderer.prototype.setLanguage = function (language) {
    this.language = language === "ta" ? "ta" : "en";
    this.render();
  };

  FormRenderer.prototype.getField = function (id) {
    return (this.schema.fields || []).find(function (field) { return field.id === id; });
  };

  FormRenderer.prototype.targetField = function (field, rule) {
    return rule.actionPayload && rule.actionPayload.fieldId || field.id;
  };

  FormRenderer.prototype.render = function () {
    var self = this;
    this.mountPoint.innerHTML = "";
    var form = document.createElement("form");
    form.className = "fb-form";
    form.noValidate = true;
    var fields = (this.schema.fields || []).slice().sort(function (a, b) { return a.order - b.order; });

    fields.forEach(function (field) {
      var wrapper = document.createElement("div");
      wrapper.className = "fb-field";
      wrapper.dataset.fieldId = field.id;
      if (field.type === "label") {
        wrapper.className += " fb-notice";
        wrapper.textContent = textFor(field.label, self.language);
        form.appendChild(wrapper);
        return;
      }

      var label = document.createElement("label");
      label.className = "fb-label";
      label.dataset.labelFor = field.id;
      label.textContent = textFor(field.label, self.language) || field.id;
      if (field.required) {
        var requiredMark = document.createElement("span");
        requiredMark.className = "fb-required";
        requiredMark.textContent = " *";
        label.appendChild(requiredMark);
      }
      wrapper.appendChild(label);
      var control = self.makeControl(field);
      if (control) wrapper.appendChild(control);
      var error = document.createElement("div");
      error.className = "fb-error";
      error.dataset.errorFor = field.id;
      wrapper.appendChild(error);
      form.appendChild(wrapper);
    });

    var submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "fb-submit";
    submit.textContent = textFor(this.schema.settings && this.schema.settings.submitLabel, this.language) || "Submit registration";
    form.appendChild(submit);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      self.applyRules("onSubmit");
      var errors = self.validate();
      if (Object.keys(errors).length) {
        self.showErrors(errors);
        return;
      }
      if (self.blocked) return;
      self.onSubmit(self.answers);
    });
    this.mountPoint.appendChild(form);
    this.applyRules("onLoad");
    this.applyRules("onChange");
  };

  FormRenderer.prototype.makeControl = function (field) {
    var self = this;
    var value = this.answers[field.id];
    var type = field.type;
    if (type === "dropdown") {
      var select = document.createElement("select");
      select.className = "fb-control";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = this.language === "ta" ? "தேர்வு செய்யவும்" : "Select an option";
      select.appendChild(placeholder);
      (field.options || []).forEach(function (option) {
        var item = document.createElement("option");
        item.value = option.value;
        item.textContent = optionLabel(option, self.language);
        item.selected = value === option.value;
        select.appendChild(item);
      });
      select.addEventListener("change", function () { self.updateAnswer(field.id, select.value); });
      return select;
    }
    if (type === "radio_icon" || type === "checkbox_icon") {
      var group = document.createElement("div");
      group.className = "fb-choice-grid";
      (field.options || []).forEach(function (option) {
        var item = document.createElement("label");
        item.className = "fb-choice";
        var input = document.createElement("input");
        input.type = type === "radio_icon" ? "radio" : "checkbox";
        input.name = field.id;
        input.value = option.value;
        input.checked = type === "radio_icon" ? value === option.value : Array.isArray(value) && value.indexOf(option.value) !== -1;
        input.addEventListener("change", function () {
          if (type === "radio_icon") self.updateAnswer(field.id, input.value);
          else {
            var selected = Array.prototype.slice.call(group.querySelectorAll("input:checked")).map(function (node) { return node.value; });
            self.updateAnswer(field.id, selected);
          }
        });
        item.appendChild(input);
        var icon = document.createElement("span");
        icon.className = "fb-choice-icon";
        icon.textContent = option.icon || "•";
        item.appendChild(icon);
        var optionText = document.createElement("span");
        optionText.textContent = optionLabel(option, self.language);
        item.appendChild(optionText);
        group.appendChild(item);
      });
      return group;
    }
    if (type === "image") {
      var imageWrap = document.createElement("div");
      imageWrap.className = "fb-image-wrap";
      if (field.imageUrl) {
        var image = document.createElement("img");
        image.src = field.imageUrl;
        image.alt = textFor(field.label, this.language);
        image.className = "fb-image";
        imageWrap.appendChild(image);
      }
      if (field.acceptUpload) {
        var file = document.createElement("input");
        file.type = "file";
        file.accept = "image/*";
        file.className = "fb-control";
        file.addEventListener("change", function () {
          var selected = file.files && file.files[0];
          if (!selected) return;
          if (selected.size > 1200000) {
            self.setError(field.id, "Image must be 1MB or smaller");
            file.value = "";
            return;
          }
          var reader = new FileReader();
          reader.onload = function () { self.updateAnswer(field.id, reader.result); };
          reader.readAsDataURL(selected);
        });
        imageWrap.appendChild(file);
      }
      return imageWrap;
    }
    if (type === "toggle") {
      var toggleLabel = document.createElement("label");
      toggleLabel.className = "fb-toggle";
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = value === true || value === "true";
      checkbox.addEventListener("change", function () { self.updateAnswer(field.id, checkbox.checked); });
      toggleLabel.appendChild(checkbox);
      toggleLabel.appendChild(document.createTextNode(this.language === "ta" ? "ஆம்" : "Yes"));
      return toggleLabel;
    }
    var input = document.createElement(type === "textarea" ? "textarea" : "input");
    input.className = "fb-control";
    if (type === "textarea") input.rows = 4;
    else input.type = type === "currency" || type === "number" ? "number" : type;
    if (type === "currency") input.step = "0.01";
    input.value = value == null ? "" : value;
    input.addEventListener("input", function () { self.updateAnswer(field.id, input.value); });
    return input;
  };

  FormRenderer.prototype.updateAnswer = function (id, value) {
    this.answers[id] = value;
    this.applyRules("onChange");
    this.clearError(id);
  };

  FormRenderer.prototype.applyRules = function (trigger) {
    var self = this;
    this.blocked = false;
    (this.schema.fields || []).forEach(function (field) {
      (field.rules || []).forEach(function (rule, index) {
        if (rule.trigger !== trigger) return;
        var active = matches(rule, self.answers[field.id], self.answers);
        var key = field.id + ":" + index + ":" + trigger;
        var targetId = self.targetField(field, rule);
        var target = self.mountPoint.querySelector('[data-field-id="' + targetId.replace(/"/g, "") + '"]');
        if (rule.action === "showField" || rule.action === "hideField") {
          if (target) target.style.display = (rule.action === "showField" ? active : !active) ? "" : "none";
        } else if (rule.action === "setRequired") {
          if (active) self.requiredOverrides[targetId] = rule.actionPayload && rule.actionPayload.required !== false;
          else delete self.requiredOverrides[targetId];
        } else if (rule.action === "blockSubmit") {
          if (active) self.blocked = true;
        } else if (rule.action === "showPopup" && active && !self.popupState[key]) {
          self.popupState[key] = true;
          self.onPopup(rule.actionPayload && rule.actionPayload.title || "Form notice", rule.actionPayload && rule.actionPayload.message || "Please review this field.");
        } else if (rule.action === "showPopup" && !active) {
          self.popupState[key] = false;
        }
      });
    });
    (this.schema.fields || []).forEach(function (field) {
      if (field.type === "label") return;
      var required = Object.prototype.hasOwnProperty.call(self.requiredOverrides, field.id)
        ? self.requiredOverrides[field.id] : field.required;
      var label = self.mountPoint.querySelector('[data-label-for="' + field.id.replace(/"/g, "") + '"]');
      if (label) {
        var mark = label.querySelector(".fb-required");
        if (required && !mark) {
          mark = document.createElement("span");
          mark.className = "fb-required";
          mark.textContent = " *";
          label.appendChild(mark);
        } else if (!required && mark) {
          mark.remove();
        }
      }
      var wrapper = self.mountPoint.querySelector('[data-field-id="' + field.id.replace(/"/g, "") + '"]');
      if (wrapper) wrapper.setAttribute("aria-required", required ? "true" : "false");
    });
  };

  FormRenderer.prototype.validate = function () {
    var self = this;
    var errors = {};
    (this.schema.fields || []).forEach(function (field) {
      if (field.type === "label") return;
      var wrapper = self.mountPoint.querySelector('[data-field-id="' + field.id.replace(/"/g, "") + '"]');
      if (wrapper && wrapper.style.display === "none") return;
      var required = Object.prototype.hasOwnProperty.call(self.requiredOverrides, field.id)
        ? self.requiredOverrides[field.id] : field.required;
      var value = self.answers[field.id];
      if (required && empty(value)) errors[field.id] = "This field is required";
      if (field.type === "email" && !empty(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors[field.id] = "Enter a valid email address";
      if ((field.type === "number" || field.type === "currency") && !empty(value) && !Number.isFinite(Number(value))) errors[field.id] = "Enter a valid number";
    });
    return errors;
  };

  FormRenderer.prototype.setError = function (id, message) {
    var error = this.mountPoint.querySelector('[data-error-for="' + id.replace(/"/g, "") + '"]');
    if (error) error.textContent = message;
  };

  FormRenderer.prototype.clearError = function (id) { this.setError(id, ""); };

  FormRenderer.prototype.showErrors = function (errors) {
    var self = this;
    Object.keys(errors).forEach(function (id) { self.setError(id, errors[id]); });
  };

  window.ExperimentalFormRenderer = {
    FormRenderer: FormRenderer,
    FIELD_TYPES: FIELD_TYPES,
    textFor: textFor
  };
})();