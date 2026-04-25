function removeRowButton(row) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost-button danger';
  button.textContent = 'Verwijder';
  button.addEventListener('click', () => {
    row.remove();
    syncInviteeRequiredValues();
  });
  return button;
}

function formatDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function plusOneHour(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setHours(date.getHours() + 1);
  return formatDateTimeLocal(date);
}

function syncSlotEnd(startInput, endInput) {
  if (!startInput || !endInput || !startInput.value) return;
  if (endInput.value && endInput.dataset.autoFilled !== 'true') return;
  const nextValue = plusOneHour(startInput.value);
  if (!nextValue) return;
  endInput.value = nextValue;
  endInput.dataset.autoFilled = 'true';
}

function bindSlotRow(row) {
  const [startInput, endInput] = row.querySelectorAll('input[type="datetime-local"]');
  if (!startInput || !endInput) return row;
  startInput.addEventListener('input', () => syncSlotEnd(startInput, endInput));
  endInput.addEventListener('input', () => {
    endInput.dataset.autoFilled = 'false';
  });
  syncSlotEnd(startInput, endInput);
  return row;
}

function createSlotRow() {
  const row = document.createElement('div');
  row.className = 'dynamic-row two-up';
  row.innerHTML = `
    <input type="datetime-local" class="text-input" name="slots[]" required />
    <input type="datetime-local" class="text-input" name="slots_end[]" />
  `;
  row.appendChild(removeRowButton(row));
  return bindSlotRow(row);
}

function addSlotRow(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const row = createSlotRow();
  container.appendChild(row);
}

function addInviteeRow() {
  const container = document.getElementById('inviteeRows');
  if (!container) return;
  const index = container.querySelectorAll('.invitee-row').length;
  const row = document.createElement('div');
  row.className = 'dynamic-row invitee-row';
  row.innerHTML = `
    <input class="text-input" name="invitee_name[]" placeholder="Naam" />
    <select class="text-input" name="invitee_role[]"><option value="student">Student</option><option value="ondernemer">Ondernemer</option></select>
    <input class="text-input" name="invitee_email[]" placeholder="E-mail (optioneel)" />
    <input class="text-input" name="invitee_phone[]" placeholder="Telefoon (optioneel)" />
    <input class="text-input" name="invitee_organization[]" placeholder="Organisatie / context" />
    <label class="checkbox-line"><input type="checkbox" name="invitee_required" value="${index}" /> Verplicht voor beste match</label>
  `;
  row.appendChild(removeRowButton(row));
  container.appendChild(row);
  syncInviteeRequiredValues();
}

function syncInviteeRequiredValues() {
  document.querySelectorAll('#inviteeRows .invitee-row').forEach((row, index) => {
    const checkbox = row.querySelector('input[name="invitee_required"]');
    if (checkbox) checkbox.value = String(index);
  });
}

window.datumprikkerCreateForm = function () {
  document.querySelector('[data-add-row="slotRows"]')?.addEventListener('click', () => addSlotRow('slotRows'));
  document.querySelector('[data-add-row="inviteeRows"]')?.addEventListener('click', addInviteeRow);
  document.querySelectorAll('#slotRows .dynamic-row').forEach(bindSlotRow);
  document.getElementById('eventForm')?.addEventListener('submit', () => {
    syncInviteeRequiredValues();
  });
  syncInviteeRequiredValues();
};

window.datumprikkerEditForm = function () {
  document.querySelector('[data-add-row="slotRows"]')?.addEventListener('click', () => addSlotRow('slotRows'));
  document.querySelectorAll('#slotRows .dynamic-row').forEach(bindSlotRow);
};

document.querySelectorAll('[data-remove-row]').forEach((button) => {
  button.addEventListener('click', () => {
    button.closest('.dynamic-row')?.remove();
    syncInviteeRequiredValues();
  });
});

const helpDialog = document.getElementById('helpDialog');
const helpBackdrop = document.querySelector('.help-backdrop');

function setHelpOpen(isOpen) {
  if (!helpDialog || !helpBackdrop) return;
  helpDialog.hidden = !isOpen;
  helpBackdrop.hidden = !isOpen;
  document.body.classList.toggle('help-open', isOpen);
}

document.querySelectorAll('[data-help-toggle]').forEach((button) => {
  button.addEventListener('click', () => setHelpOpen(true));
});

document.querySelectorAll('[data-help-close]').forEach((button) => {
  button.addEventListener('click', () => setHelpOpen(false));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setHelpOpen(false);
});

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const input = document.getElementById(button.dataset.copy);
    if (!input) return;
    await navigator.clipboard.writeText(input.value);
    const previous = button.textContent;
    button.textContent = 'Gekopieerd';
    setTimeout(() => {
      button.textContent = previous;
    }, 1500);
  });
});

document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) {
      event.preventDefault();
    }
  });
});

if (document.getElementById('inviteeRows')) {
  window.datumprikkerCreateForm();
} else if (document.getElementById('slotRows')) {
  window.datumprikkerEditForm();
}
