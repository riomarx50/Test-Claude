const STORAGE_KEY = 'todos';
let filter = 'all';
let currentView = 'list';
let todos = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function addTodo(text, startDate, dueDate) {
  const trimmed = text.trim();
  if (!trimmed) return;
  todos.push({
    id: Date.now(),
    text: trimmed,
    completed: false,
    startDate: startDate || null,
    dueDate: dueDate || null,
  });
  save();
  render();
}

function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    save();
    render();
  }
}

function deleteTodo(id) {
  todos = todos.filter(t => t.id !== id);
  save();
  render();
}

function clearCompleted() {
  todos = todos.filter(t => !t.completed);
  save();
  render();
}

function formatDue(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isOverdue(todo) {
  if (!todo.dueDate || todo.completed) return false;
  return new Date(todo.dueDate) < new Date();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── List view ─────────────────────────────────────────────
function renderList() {
  const list = document.getElementById('list-view');

  const visible = todos.filter(t => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  if (visible.length === 0) {
    list.innerHTML = '<li class="empty-msg">할일이 없습니다.</li>';
    return;
  }

  list.innerHTML = visible.map(todo => {
    const overdue = isOverdue(todo);
    const startStr = formatDue(todo.startDate);
    const dueStr = formatDue(todo.dueDate);
    let dateLabel = '';
    if (startStr && dueStr) {
      dateLabel = `${startStr} ~ ${dueStr}`;
    } else if (dueStr) {
      dateLabel = `마감 ${dueStr}`;
    } else if (startStr) {
      dateLabel = `시작 ${startStr}`;
    }
    return `
      <li class="todo-item${todo.completed ? ' completed' : ''}${overdue ? ' overdue' : ''}" data-id="${todo.id}">
        <input type="checkbox" ${todo.completed ? 'checked' : ''} />
        <div class="todo-body">
          <span class="todo-text">${escapeHtml(todo.text)}</span>
          ${dateLabel ? `<span class="todo-due${overdue ? ' todo-due--over' : ''}">${overdue ? '⚠ 마감 초과 · ' : ''}${dateLabel}</span>` : ''}
        </div>
        <button class="delete-btn" title="삭제">✕</button>
      </li>
    `;
  }).join('');
}

// ── Gantt view ────────────────────────────────────────────
function renderGantt() {
  const ganttInner = document.getElementById('gantt-inner');

  const withDates = todos.filter(t => t.startDate && t.dueDate);

  if (withDates.length === 0) {
    ganttInner.innerHTML = '<div class="empty-msg" style="padding:32px 16px">시작일시와 마감일시가 모두 있는 항목이 없습니다.</div>';
    return;
  }

  const minTime = Math.min(...withDates.map(t => new Date(t.startDate).getTime()));
  const maxTime = Math.max(...withDates.map(t => new Date(t.dueDate).getTime()));

  const startDay = new Date(minTime);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(maxTime);
  endDay.setHours(23, 59, 59, 999);
  const totalMs = endDay.getTime() - startDay.getTime();

  // Build day ticks
  const days = [];
  const cur = new Date(startDay);
  while (cur <= endDay) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const BAR_W = Math.max(days.length * 72, 480);
  const pad = n => String(n).padStart(2, '0');

  const ticks = days.map(day => {
    const pct = ((day.getTime() - startDay.getTime()) / totalMs) * 100;
    const label = `${day.getMonth()+1}/${day.getDate()}`;
    return `<div class="gantt-tick" style="left:${pct}%">${label}</div>`;
  }).join('');

  // Today marker
  const now = new Date();
  let todayMarker = '';
  if (now >= startDay && now <= endDay) {
    const todayPct = ((now.getTime() - startDay.getTime()) / totalMs) * 100;
    todayMarker = `<div class="gantt-today" style="left:${todayPct}%" title="오늘"></div>`;
  }

  // Grid lines
  const gridLines = days.map(day => {
    const pct = ((day.getTime() - startDay.getTime()) / totalMs) * 100;
    return `<div class="gantt-grid-line" style="left:${pct}%"></div>`;
  }).join('');

  const rows = withDates.map(todo => {
    const barLeft = ((new Date(todo.startDate).getTime() - startDay.getTime()) / totalMs) * 100;
    const barWidth = ((new Date(todo.dueDate).getTime() - new Date(todo.startDate).getTime()) / totalMs) * 100;
    const overdue = isOverdue(todo);

    const cls = ['gantt-bar',
      todo.completed ? 'gantt-bar--done' : '',
      overdue ? 'gantt-bar--over' : ''
    ].filter(Boolean).join(' ');

    const startD = new Date(todo.startDate);
    const endD = new Date(todo.dueDate);
    const tooltip = `${escapeHtml(todo.text)}\n${pad(startD.getMonth()+1)}/${pad(startD.getDate())} ~ ${pad(endD.getMonth()+1)}/${pad(endD.getDate())}`;

    return `
      <div class="gantt-row">
        <div class="gantt-label" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</div>
        <div class="gantt-track" style="width:${BAR_W}px">
          ${gridLines}
          ${todayMarker}
          <div class="${cls}"
               style="left:${barLeft.toFixed(2)}%;width:${Math.max(barWidth, 1).toFixed(2)}%"
               title="${tooltip}">
            <span class="gantt-bar-label">${escapeHtml(todo.text)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  ganttInner.innerHTML = `
    <div class="gantt-header-row">
      <div class="gantt-label gantt-label--header"></div>
      <div class="gantt-track gantt-date-header" style="width:${BAR_W}px">
        ${ticks}
      </div>
    </div>
    ${rows}
  `;
}

// ── Main render ───────────────────────────────────────────
function render() {
  const listView = document.getElementById('list-view');
  const ganttView = document.getElementById('gantt-view');
  const countEl = document.getElementById('count');

  if (currentView === 'gantt') {
    listView.classList.add('hidden');
    ganttView.classList.remove('hidden');
    renderGantt();
  } else {
    listView.classList.remove('hidden');
    ganttView.classList.add('hidden');
    renderList();
  }

  const activeCount = todos.filter(t => !t.completed).length;
  countEl.textContent = `${activeCount}개 남음`;
}

// ── Events ────────────────────────────────────────────────
const input = document.getElementById('todo-input');
const startInput = document.getElementById('todo-start');
const datetimeInput = document.getElementById('todo-datetime');

document.getElementById('add-btn').addEventListener('click', () => {
  addTodo(input.value, startInput.value, datetimeInput.value);
  input.value = '';
  startInput.value = '';
  datetimeInput.value = '';
  input.focus();
});

input.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    addTodo(input.value, startInput.value, datetimeInput.value);
    input.value = '';
    startInput.value = '';
    datetimeInput.value = '';
  }
});

document.getElementById('clear-datetime-btn').addEventListener('click', () => {
  startInput.value = '';
  datetimeInput.value = '';
  input.focus();
});

document.getElementById('list-view').addEventListener('click', e => {
  const item = e.target.closest('.todo-item');
  if (!item) return;
  const id = Number(item.dataset.id);
  if (e.target.matches('input[type="checkbox"]')) {
    toggleTodo(id);
  } else if (e.target.matches('.delete-btn')) {
    deleteTodo(id);
  }
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentView = btn.dataset.view;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

document.getElementById('clear-btn').addEventListener('click', clearCompleted);

render();
