const STORAGE_KEY = 'todos';
let filter = 'all';
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

function addTodo(text, dueDate) {
  const trimmed = text.trim();
  if (!trimmed) return;
  todos.push({ id: Date.now(), text: trimmed, completed: false, dueDate: dueDate || null });
  save();
  render();
}

function formatDue(dueDate) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isOverdue(todo) {
  if (!todo.dueDate || todo.completed) return false;
  return new Date(todo.dueDate) < new Date();
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

function render() {
  const list = document.getElementById('todo-list');
  const countEl = document.getElementById('count');

  const visible = todos.filter(t => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  if (visible.length === 0) {
    list.innerHTML = '<li class="empty-msg">할일이 없습니다.</li>';
  } else {
    list.innerHTML = visible.map(todo => {
      const due = formatDue(todo.dueDate);
      const overdue = isOverdue(todo);
      return `
        <li class="todo-item${todo.completed ? ' completed' : ''}${overdue ? ' overdue' : ''}" data-id="${todo.id}">
          <input type="checkbox" ${todo.completed ? 'checked' : ''} />
          <div class="todo-body">
            <span class="todo-text">${escapeHtml(todo.text)}</span>
            ${due ? `<span class="todo-due${overdue ? ' todo-due--over' : ''}">${overdue ? '⚠ 마감 초과 · ' : ''}${due}</span>` : ''}
          </div>
          <button class="delete-btn" title="삭제">✕</button>
        </li>
      `;
    }).join('');
  }

  const activeCount = todos.filter(t => !t.completed).length;
  countEl.textContent = `${activeCount}개 남음`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Event: add
const input = document.getElementById('todo-input');
const datetimeInput = document.getElementById('todo-datetime');

document.getElementById('add-btn').addEventListener('click', () => {
  addTodo(input.value, datetimeInput.value);
  input.value = '';
  datetimeInput.value = '';
  input.focus();
});

input.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    addTodo(input.value, datetimeInput.value);
    input.value = '';
    datetimeInput.value = '';
  }
});

document.getElementById('clear-datetime-btn').addEventListener('click', () => {
  datetimeInput.value = '';
  input.focus();
});

// Event: list (delegation)
document.getElementById('todo-list').addEventListener('click', e => {
  const item = e.target.closest('.todo-item');
  if (!item) return;
  const id = Number(item.dataset.id);

  if (e.target.matches('input[type="checkbox"]')) {
    toggleTodo(id);
  } else if (e.target.matches('.delete-btn')) {
    deleteTodo(id);
  }
});

// Event: filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

// Event: clear completed
document.getElementById('clear-btn').addEventListener('click', clearCompleted);

// Init
render();
