// ===== Skills Management =====

import state from './state.js';
import { DOM } from './dom.js';
import { generateId, showToast, escapeHtml } from './utils.js';
import { saveSkills } from './storage.js';

export function openSkillsPanel() {
    DOM.skillsPanel.classList.add('active');
    DOM.skillsOverlay.classList.add('active');
    renderSkillsList();
    clearSkillForm();
}

export function closeSkillsPanel() {
    DOM.skillsPanel.classList.remove('active');
    DOM.skillsOverlay.classList.remove('active');
}

function clearSkillForm() {
    DOM.skillName.value = '';
    DOM.skillEmoji.value = '🤖';
    DOM.skillPrompt.value = '';
    DOM.skillFormTitle.textContent = 'Add Skill';
    DOM.btnAddSkill.textContent = '+ Add Skill';
    DOM.btnAddSkill.dataset.editId = '';
}

function renderSkillsList() {
    if (state.skills.length === 0) {
        DOM.skillsListContainer.innerHTML = '<div class="models-list-empty">No skills yet — create one below</div>';
        return;
    }
    DOM.skillsListContainer.innerHTML = '';
    for (const skill of state.skills) {
        DOM.skillsListContainer.appendChild(createSkillCard(skill));
    }
}

function createSkillCard(skill) {
    const isActive = state.activeSkillId === skill.id;
    const card = document.createElement('div');
    card.className = `skill-card${isActive ? ' active' : ''}`;
    card.dataset.id = skill.id;

    card.innerHTML = `
    <div class="skill-card-header">
      <div class="skill-card-info">
        <span class="skill-card-emoji">${skill.emoji || '🤖'}</span>
        <div>
          <div class="skill-card-name">${escapeHtml(skill.name)}</div>
          <div class="skill-card-prompt">${escapeHtml(skill.prompt.slice(0, 80))}${skill.prompt.length > 80 ? '...' : ''}</div>
        </div>
      </div>
      <span class="skill-card-status ${isActive ? 'active' : 'inactive'}">
        ${isActive ? '● Active' : '○ Inactive'}
      </span>
    </div>
    <div class="skill-card-actions">
      <button class="btn-skill-activate" data-id="${skill.id}">
        ${isActive ? '⏸ Deactivate' : '▶ Activate'}
      </button>
      <button class="btn-skill-edit" data-id="${skill.id}">✏️ Edit</button>
      <button class="btn-skill-delete" data-id="${skill.id}">🗑️ Delete</button>
    </div>
  `;

    card.addEventListener('click', (e) => {
        const activateBtn = e.target.closest('.btn-skill-activate');
        const editBtn = e.target.closest('.btn-skill-edit');
        const deleteBtn = e.target.closest('.btn-skill-delete');

        if (activateBtn) {
            if (isActive) {
                deactivateSkill();
            } else {
                activateSkill(skill.id);
            }
        }
        if (editBtn) {
            DOM.skillName.value = skill.name;
            DOM.skillEmoji.value = skill.emoji || '🤖';
            DOM.skillPrompt.value = skill.prompt;
            DOM.skillFormTitle.textContent = 'Edit Skill';
            DOM.btnAddSkill.textContent = '💾 Save Changes';
            DOM.btnAddSkill.dataset.editId = skill.id;
            DOM.skillName.focus();
        }
        if (deleteBtn) {
            deleteSkill(skill.id);
        }
    });

    return card;
}

export function addOrUpdateSkill() {
    const name = DOM.skillName.value.trim();
    const emoji = DOM.skillEmoji.value.trim() || '🤖';
    const prompt = DOM.skillPrompt.value.trim();
    const editId = DOM.btnAddSkill.dataset.editId;

    if (!name) { showToast('Skill name is required', 'warning'); return; }
    if (!prompt) { showToast('Skill prompt is required', 'warning'); return; }

    if (editId) {
        // Edit existing
        const skill = state.skills.find(s => s.id === editId);
        if (skill) {
            skill.name = name;
            skill.emoji = emoji;
            skill.prompt = prompt;
            showToast('Skill updated', 'success');
        }
    } else {
        // Add new
        state.skills.push({
            id: generateId(),
            name,
            emoji,
            prompt,
        });
        showToast('Skill added', 'success');
    }

    saveSkills();
    renderSkillsList();
    clearSkillForm();
    updateSkillBadge();
}

function activateSkill(id) {
    state.activeSkillId = id;
    saveSkills();
    renderSkillsList();
    updateSkillBadge();
    const skill = state.skills.find(s => s.id === id);
    showToast(`Skill activated: ${skill?.emoji || ''} ${skill?.name || ''}`, 'success');
}

function deactivateSkill() {
    state.activeSkillId = null;
    saveSkills();
    renderSkillsList();
    updateSkillBadge();
    showToast('Skill deactivated', 'info');
}

function deleteSkill(id) {
    state.skills = state.skills.filter(s => s.id !== id);
    if (state.activeSkillId === id) {
        state.activeSkillId = null;
    }
    saveSkills();
    renderSkillsList();
    updateSkillBadge();
    showToast('Skill deleted', 'info');
}

/**
 * Get the active skill's system prompt, or empty string if none.
 */
export function getActiveSkillPrompt() {
    if (!state.activeSkillId) return '';
    const skill = state.skills.find(s => s.id === state.activeSkillId);
    return skill ? skill.prompt : '';
}

/**
 * Update the skills sidebar button to show active state.
 */
export function updateSkillBadge() {
    const btn = DOM.btnSkills;
    if (!btn) return;
    if (state.activeSkillId) {
        const skill = state.skills.find(s => s.id === state.activeSkillId);
        btn.classList.add('skill-active');
        const label = btn.querySelector('span');
        if (label && skill) label.textContent = `${skill.emoji} ${skill.name}`;
    } else {
        btn.classList.remove('skill-active');
        const label = btn.querySelector('span');
        if (label) label.textContent = 'Skills';
    }
}
