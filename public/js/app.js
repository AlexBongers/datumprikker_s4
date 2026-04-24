function removeRowButton(row) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost-button danger';
  button.textContent = 'Verwijder';
  button.addEventListener('click', () => row.remove());
  return button;
}

function addSlotRow(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'dynamic-row two-up';
  row.innerHTML = `
    <input type="datetime-local" class="text-input" name="slots[]" required />
    <input type="datetime-local" class="text-input" name="slots_end[]" />
  `;
  row.appendChild(removeRowButton(row));
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
}

window.datumprikkerCreateForm = function () {
  document.querySelector('[data-add-row="slotRows"]')?.addEventListener('click', () => addSlotRow('slotRows'));
  document.querySelector('[data-add-row="inviteeRows"]')?.addEventListener('click', addInviteeRow);
  document.getElementById('eventForm')?.addEventListener('submit', () => {
    document.querySelectorAll('#inviteeRows .invitee-row').forEach((row, index) => {
      const checkbox = row.querySelector('input[name="invitee_required"]');
      if (checkbox) checkbox.value = String(index);
    });
  });
};

window.datumprikkerEditForm = function () {
  document.querySelector('[data-add-row="slotRows"]')?.addEventListener('click', () => addSlotRow('slotRows'));
};

document.querySelectorAll('[data-remove-row]').forEach((button) => {
  button.addEventListener('click', () => button.closest('.dynamic-row')?.remove());
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
