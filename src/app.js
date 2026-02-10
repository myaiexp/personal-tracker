// Supabase Configuration - from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth State
let currentUser = null;

// State
let tasks = [];
let streaks = { current: 0, longest: 0 };
let history = [];
let currentTaskIdForFailure = null;
let logFields = [];
let todayLog = null;
let todayEntries = {};
let logHistory = [];

// History view state
let currentView = 'dashboard'; // 'dashboard' | 'history'
let historyWeekOffset = 0;     // 0 = current week, 1 = last week, etc. Max 11.
let historyWeekData = null;    // Cached data for currently viewed week
let allTasksCache = null;      // Cached tasks including archived

// DOM Elements
const addTaskForm = document.getElementById('add-task-form');
const taskTitleInput = document.getElementById('task-title');
const dailyTasksContainer = document.getElementById('daily-tasks');
const onceTasksContainer = document.getElementById('once-tasks');
const dailyTasksEmpty = document.getElementById('daily-tasks-empty');
const onceTasksEmpty = document.getElementById('once-tasks-empty');
const currentDateElement = document.getElementById('current-date');
const currentStreakElement = document.getElementById('current-streak');
const longestStreakElement = document.getElementById('longest-streak');
const calendarElement = document.getElementById('calendar');
const failureModal = document.getElementById('failure-modal');
const failureNoteInput = document.getElementById('failure-note-input');
const failureNoteError = document.getElementById('failure-note-error');
const failureModalCancel = document.getElementById('failure-modal-cancel');
const failureModalSubmit = document.getElementById('failure-modal-submit');
const logFieldsContainer = document.getElementById('log-fields-container');
const logFieldsEmpty = document.getElementById('log-fields-empty');
const dailyLogNotes = document.getElementById('daily-log-notes');
const dailyLogSaveStatus = document.getElementById('daily-log-save-status');
const manageFieldsModal = document.getElementById('manage-fields-modal');

// History view DOM elements
const dashboardView = document.getElementById('dashboard-view');
const historyView = document.getElementById('history-view');
const historyWeekLabel = document.getElementById('history-week-label');
const historyWeekSummary = document.getElementById('history-week-summary');
const historyDaysContainer = document.getElementById('history-days');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  checkConfig();
  initializeApp();
  setupEventListeners();
});

function checkConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY ||
      SUPABASE_URL === 'your_supabase_url_here' ||
      SUPABASE_ANON_KEY === 'your_supabase_anon_key_here') {
    alert('⚠️ Configuration Error\n\nSupabase credentials are not properly configured.\nPlease check your .env.local file.');
  }
}

async function initializeApp() {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;

  updateCurrentDate();
  await loadTasks();
  await loadStreaksAndHistory();
  await loadDailyLog();
}

// Authentication
async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    showLoginForm();
    return false;
  }

  currentUser = session.user;
  showApp();
  return true;
}

function showLoginForm() {
  document.querySelector('.container').innerHTML = `
    <div class="max-w-md mx-auto mt-20 bg-white p-8 rounded-lg shadow-md">
      <h1 class="text-3xl font-bold text-gray-800 mb-6">Daily Task Tracker</h1>
      <form id="login-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
          <input type="email" id="login-email" required
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
          <input type="password" id="login-password" required
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit"
          class="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold">
          Sign In
        </button>
        <p id="login-error" class="text-red-600 text-sm hidden"></p>
      </form>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
  } else {
    currentUser = data.user;
    location.reload(); // Reload to show main app
  }
}

function showApp() {
  // App is already rendered in HTML, just add logout button
  const header = document.querySelector('header .flex.gap-6');
  if (header) {
    const logoutBtn = document.createElement('div');
    logoutBtn.className = 'text-center';
    logoutBtn.innerHTML = `
      <button id="logout-btn"
        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold">
        Logout
      </button>
    `;
    header.appendChild(logoutBtn);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  location.reload();
}

function setupEventListeners() {
  addTaskForm.addEventListener('submit', handleAddTask);
  failureModalCancel.addEventListener('click', hideFailureModal);
  failureModalSubmit.addEventListener('click', handleFailureNoteSubmit);
  document.getElementById('export-btn').addEventListener('click', handleExportToClipboard);

  failureModal.addEventListener('click', (e) => {
    if (e.target === failureModal) {
      hideFailureModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !failureModal.classList.contains('hidden')) {
      hideFailureModal();
    }
    if (e.key === 'Escape' && !manageFieldsModal.classList.contains('hidden')) {
      hideManageFieldsModal();
    }
  });

  // History view event listeners
  document.getElementById('history-btn').addEventListener('click', () => switchView('history'));
  document.getElementById('history-back-btn').addEventListener('click', () => switchView('dashboard'));
  document.getElementById('history-prev-week').addEventListener('click', () => navigateHistoryWeek(1));
  document.getElementById('history-next-week').addEventListener('click', () => navigateHistoryWeek(-1));

  // Daily Log event listeners
  document.getElementById('manage-fields-btn').addEventListener('click', showManageFieldsModal);
  document.getElementById('manage-fields-close').addEventListener('click', hideManageFieldsModal);
  manageFieldsModal.addEventListener('click', (e) => {
    if (e.target === manageFieldsModal) hideManageFieldsModal();
  });
  document.getElementById('add-field-btn').addEventListener('click', handleAddField);
  document.getElementById('new-field-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddField(); }
  });
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', handleMoodSelect);
  });
  dailyLogNotes.addEventListener('input', debounce(handleNotesChange, 1000));
}

// Date utilities
function updateCurrentDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = new Date().toLocaleDateString('en-US', options);
  currentDateElement.textContent = dateStr;
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

// Supabase API calls
async function fetchTasks() {
  const { data, error } = await supabaseClient
    .from('tasks')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function createTask(title, type) {
  const { data, error } = await supabaseClient
    .from('tasks')
    .insert([{ title, type, is_archived: false, user_id: currentUser.id }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateTask(id, title) {
  const { data, error } = await supabaseClient
    .from('tasks')
    .update({ title })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteTask(id) {
  const { error } = await supabaseClient
    .from('tasks')
    .update({ is_archived: true })
    .eq('id', id);

  if (error) throw error;
}

async function fetchCompletions() {
  const { data, error } = await supabaseClient
    .from('completions')
    .select('*')
    .order('completed_date', { ascending: false })
    .limit(500);

  if (error) throw error;
  return data || [];
}

async function getCompletionForTaskAndDate(taskId, date) {
  const { data, error } = await supabaseClient
    .from('completions')
    .select('*')
    .eq('task_id', taskId)
    .eq('completed_date', date)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function markComplete(taskId, date) {
  const existing = await getCompletionForTaskAndDate(taskId, date);

  if (existing) {
    const { data, error } = await supabaseClient
      .from('completions')
      .update({ is_completed: true, failure_note: null, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabaseClient
      .from('completions')
      .insert([{ task_id: taskId, completed_date: date, is_completed: true }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

async function markIncomplete(taskId, date, failureNote) {
  const existing = await getCompletionForTaskAndDate(taskId, date);

  if (existing) {
    const { data, error } = await supabaseClient
      .from('completions')
      .update({ is_completed: false, failure_note: failureNote, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabaseClient
      .from('completions')
      .insert([{ task_id: taskId, completed_date: date, is_completed: false, failure_note: failureNote }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

// Daily Log API calls
async function fetchLogFields() {
  const { data, error } = await supabaseClient
    .from('log_fields')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function createLogField(name, type) {
  const maxOrder = logFields.length > 0
    ? Math.max(...logFields.map(f => f.display_order)) + 1
    : 0;

  const { data, error } = await supabaseClient
    .from('log_fields')
    .insert([{ name, type, user_id: currentUser.id, display_order: maxOrder }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteLogField(id) {
  const { error } = await supabaseClient
    .from('log_fields')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

async function updateLogFieldOrder(id, newOrder) {
  const { error } = await supabaseClient
    .from('log_fields')
    .update({ display_order: newOrder })
    .eq('id', id);

  if (error) throw error;
}

async function fetchTodayLog() {
  const today = getTodayDate();
  const { data, error } = await supabaseClient
    .from('daily_logs')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('log_date', today)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function upsertDailyLog(updates) {
  const today = getTodayDate();

  if (todayLog) {
    const { data, error } = await supabaseClient
      .from('daily_logs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', todayLog.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabaseClient
      .from('daily_logs')
      .insert([{ user_id: currentUser.id, log_date: today, ...updates }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

async function fetchTodayEntries(logId) {
  const { data, error } = await supabaseClient
    .from('log_entries')
    .select('*')
    .eq('daily_log_id', logId);

  if (error) throw error;
  return data || [];
}

async function upsertLogEntry(logId, fieldId, value) {
  const { data: existing } = await supabaseClient
    .from('log_entries')
    .select('id')
    .eq('daily_log_id', logId)
    .eq('field_id', fieldId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseClient
      .from('log_entries')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabaseClient
      .from('log_entries')
      .insert([{ daily_log_id: logId, field_id: fieldId, value }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

async function fetchLogHistoryData(startDate, endDate) {
  const { data: logs, error: logsError } = await supabaseClient
    .from('daily_logs')
    .select('*')
    .eq('user_id', currentUser.id)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
    .order('log_date', { ascending: false });

  if (logsError) throw logsError;
  if (!logs || logs.length === 0) return [];

  const logIds = logs.map(l => l.id);
  const { data: entries, error: entriesError } = await supabaseClient
    .from('log_entries')
    .select('*')
    .in('daily_log_id', logIds);

  if (entriesError) throw entriesError;

  return logs.map(log => ({
    ...log,
    entries: (entries || []).filter(e => e.daily_log_id === log.id)
  }));
}

// Task management
async function loadTasks() {
  try {
    const today = getTodayDate();
    const [tasksData, completionsData] = await Promise.all([
      fetchTasks(),
      fetchCompletions()
    ]);

    const completionsMap = {};
    completionsData.forEach(comp => {
      if (!completionsMap[comp.task_id]) {
        completionsMap[comp.task_id] = { today: false, ever: false };
      }
      if (comp.completed_date === today && comp.is_completed) {
        completionsMap[comp.task_id].today = true;
      }
      if (comp.is_completed) {
        completionsMap[comp.task_id].ever = true;
      }
    });

    tasks = tasksData.map(task => ({
      ...task,
      completed_today: task.type === 'daily'
        ? completionsMap[task.id]?.today || false
        : completionsMap[task.id]?.ever || false
    }));

    renderTasks();
  } catch (error) {
    console.error('Error loading tasks:', error);
    alert('Failed to load tasks. Please check your Supabase configuration and try refreshing the page.');
  }
}

function renderTasks() {
  const dailyTasks = tasks.filter(t => t.type === 'daily');
  const onceTasks = tasks.filter(t => t.type === 'once');

  if (dailyTasks.length === 0) {
    dailyTasksContainer.innerHTML = '';
    dailyTasksEmpty.classList.remove('hidden');
  } else {
    dailyTasksEmpty.classList.add('hidden');
    dailyTasksContainer.innerHTML = dailyTasks.map(renderTaskItem).join('');
  }

  if (onceTasks.length === 0) {
    onceTasksContainer.innerHTML = '';
    onceTasksEmpty.classList.remove('hidden');
  } else {
    onceTasksEmpty.classList.add('hidden');
    onceTasksContainer.innerHTML = onceTasks.map(renderTaskItem).join('');
  }

  attachTaskEventListeners();
}

function renderTaskItem(task) {
  const checkedAttr = task.completed_today ? 'checked' : '';
  const completedClass = task.completed_today ? 'task-completed' : '';

  return `
    <div class="task-item ${completedClass} flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors" data-task-id="${task.id}">
      <input
        type="checkbox"
        class="task-checkbox w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
        ${checkedAttr}
        data-task-id="${task.id}"
      />
      <span class="task-title flex-1 text-gray-800" data-task-id="${task.id}">${escapeHtml(task.title)}</span>
      <button class="edit-btn px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors" data-task-id="${task.id}">
        Edit
      </button>
      <button class="delete-btn px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors" data-task-id="${task.id}">
        Delete
      </button>
    </div>
  `;
}

function attachTaskEventListeners() {
  document.querySelectorAll('.task-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleTaskToggle);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', handleTaskEdit);
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', handleTaskDelete);
  });
}

async function handleAddTask(e) {
  e.preventDefault();

  const title = taskTitleInput.value.trim();
  const type = document.querySelector('input[name="task-type"]:checked').value;

  if (!title) return;

  try {
    await createTask(title, type);
    taskTitleInput.value = '';
    await refreshAll();
  } catch (error) {
    console.error('Error adding task:', error);
    alert('Failed to add task. Please try again.');
  }
}

async function handleTaskToggle(e) {
  const taskId = e.target.dataset.taskId;
  const isChecked = e.target.checked;
  const today = getTodayDate();

  if (isChecked) {
    try {
      await markComplete(taskId, today);
      await refreshAll();
    } catch (error) {
      console.error('Error marking task complete:', error);
      e.target.checked = false;
      alert('Failed to mark task complete. Please try again.');
    }
  } else {
    e.target.checked = true;
    currentTaskIdForFailure = taskId;
    showFailureModal();
  }
}

async function handleTaskEdit(e) {
  const taskId = e.target.dataset.taskId;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const newTitle = prompt('Edit task title:', task.title);
  if (newTitle && newTitle.trim() && newTitle.trim() !== task.title) {
    try {
      await updateTask(taskId, newTitle.trim());
      await refreshAll();
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Failed to update task. Please try again.');
    }
  }
}

async function handleTaskDelete(e) {
  const taskId = e.target.dataset.taskId;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  if (confirm(`Are you sure you want to delete "${task.title}"?`)) {
    try {
      await deleteTask(taskId);
      await refreshAll();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task. Please try again.');
    }
  }
}

// Failure modal
function showFailureModal() {
  failureNoteInput.value = '';
  failureNoteError.classList.add('hidden');
  failureModal.classList.remove('hidden');
  failureNoteInput.focus();
}

function hideFailureModal() {
  failureModal.classList.add('hidden');
  currentTaskIdForFailure = null;
  loadTasks();
}

async function handleFailureNoteSubmit() {
  const note = failureNoteInput.value.trim();

  if (!note) {
    failureNoteError.classList.remove('hidden');
    return;
  }

  const today = getTodayDate();

  try {
    await markIncomplete(currentTaskIdForFailure, today, note);
    hideFailureModal();
    await refreshAll();
  } catch (error) {
    console.error('Error marking task incomplete:', error);
    alert('Failed to uncheck task. Please try again.');
  }
}

// Streaks and history
async function loadStreaksAndHistory() {
  try {
    const [tasksData, completionsData] = await Promise.all([
      fetchTasks(),
      fetchCompletions()
    ]);

    const today = getTodayDate();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 27);

    history = calculateHistory(tasksData, completionsData, startDate, new Date());
    streaks = calculateStreaks(history);

    renderStreaks();
    renderCalendar();
  } catch (error) {
    console.error('Error loading streaks and history:', error);
  }
}

function calculateHistory(tasks, completions, startDate, endDate) {
  const history = [];
  const completionsMap = {};

  completions.forEach(comp => {
    const key = `${comp.task_id}_${comp.completed_date}`;
    completionsMap[key] = comp.is_completed;
  });

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];

    const activeDailyTasks = tasks.filter(t =>
      t.type === 'daily' &&
      new Date(t.created_at).toISOString().split('T')[0] <= dateStr
    );

    const completedCount = activeDailyTasks.filter(t =>
      completionsMap[`${t.id}_${dateStr}`] === true
    ).length;

    const total = activeDailyTasks.length;
    const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    history.push({
      date: dateStr,
      total,
      completed: completedCount,
      percentage
    });
  }

  return history;
}

function calculateStreaks(history) {
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const day = history[i];
    if (day.percentage >= 80 && day.total > 0) {
      if (i === history.length - 1 || currentStreak > 0) {
        currentStreak++;
      }
    } else if (day.total > 0) {
      currentStreak = 0;
    }
  }

  for (const day of history) {
    if (day.percentage >= 80 && day.total > 0) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else if (day.total > 0) {
      tempStreak = 0;
    }
  }

  return { current: currentStreak, longest: longestStreak };
}

function renderStreaks() {
  currentStreakElement.textContent = streaks.current;
  longestStreakElement.textContent = streaks.longest;
}

function renderCalendar() {
  if (history.length === 0) {
    calendarElement.innerHTML = '<p class="text-gray-400 col-span-full text-center py-8">No data available yet</p>';
    return;
  }

  calendarElement.innerHTML = history.map(day => {
    const percentage = day.percentage;
    const bgColor = getColorForPercentage(percentage);

    return `
      <div class="calendar-day ${bgColor} rounded-lg p-3 text-center cursor-pointer hover:opacity-80 transition-opacity" title="${day.date}: ${percentage}% complete">
        <p class="text-xs font-medium text-gray-700">${formatDate(day.date)}</p>
        <p class="text-lg font-bold text-gray-800">${percentage}%</p>
        <p class="text-xs text-gray-600">${day.completed}/${day.total}</p>
      </div>
    `;
  }).join('');
}

function getColorForPercentage(percentage) {
  if (percentage === 0) return 'bg-gray-100';
  if (percentage < 25) return 'bg-red-100';
  if (percentage < 50) return 'bg-orange-100';
  if (percentage < 75) return 'bg-yellow-100';
  if (percentage < 100) return 'bg-lime-100';
  return 'bg-green-200';
}

async function refreshAll() {
  await loadTasks();
  await loadStreaksAndHistory();
  await loadDailyLog();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Utility
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Daily Log management
async function loadDailyLog() {
  try {
    logFields = await fetchLogFields();
    todayLog = await fetchTodayLog();

    if (todayLog) {
      const entries = await fetchTodayEntries(todayLog.id);
      todayEntries = {};
      entries.forEach(e => { todayEntries[e.field_id] = e.value; });
    } else {
      todayEntries = {};
    }

    renderDailyLogSection();
  } catch (error) {
    console.error('Error loading daily log:', error);
  }
}

function renderDailyLogSection() {
  // Render dynamic fields
  if (logFields.length === 0) {
    logFieldsContainer.innerHTML = '';
    logFieldsEmpty.classList.remove('hidden');
  } else {
    logFieldsEmpty.classList.add('hidden');
    const cols = logFields.length === 1 ? 'grid-cols-1' :
                 logFields.length === 2 ? 'sm:grid-cols-2' :
                 'sm:grid-cols-2 md:grid-cols-3';
    logFieldsContainer.className = `grid gap-4 mb-4 ${cols}`;

    logFieldsContainer.innerHTML = logFields.map(field => {
      const value = todayEntries[field.id] || '';
      let inputHtml;

      if (field.type === 'time') {
        inputHtml = `<input type="time" class="log-field-input w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" data-field-id="${field.id}" value="${escapeHtml(value)}" />`;
      } else if (field.type === 'number') {
        inputHtml = `<input type="number" class="log-field-input w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" data-field-id="${field.id}" value="${escapeHtml(value)}" placeholder="0" />`;
      } else {
        inputHtml = `<input type="text" class="log-field-input w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" data-field-id="${field.id}" value="${escapeHtml(value)}" placeholder="Enter value..." />`;
      }

      return `
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">${escapeHtml(field.name)}</label>
          ${inputHtml}
        </div>
      `;
    }).join('');

    // Attach field input listeners
    document.querySelectorAll('.log-field-input').forEach(input => {
      if (input.type === 'time' || input.type === 'number') {
        input.addEventListener('change', handleFieldChange);
      } else {
        input.addEventListener('input', debounce(function () {
          handleFieldChange({ target: input });
        }, 1000));
      }
    });
  }

  // Render mood state
  document.querySelectorAll('.mood-btn').forEach(btn => {
    if (todayLog && parseInt(btn.dataset.mood) === todayLog.mood) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Render notes
  dailyLogNotes.value = todayLog?.notes || '';

  // Clear save status on load
  dailyLogSaveStatus.textContent = '';
}

async function handleFieldChange(e) {
  const fieldId = e.target.dataset.fieldId;
  const value = e.target.value;

  setSaveStatus('saving');
  try {
    // Ensure daily_log row exists
    if (!todayLog) {
      todayLog = await upsertDailyLog({});
    }

    if (value) {
      await upsertLogEntry(todayLog.id, fieldId, value);
      todayEntries[fieldId] = value;
    }

    setSaveStatus('saved');
  } catch (error) {
    console.error('Error saving field:', error);
    setSaveStatus('error');
  }
}

async function handleMoodSelect(e) {
  const btn = e.target.closest('.mood-btn');
  if (!btn) return;
  const selectedMood = parseInt(btn.dataset.mood);

  // Update UI immediately
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  setSaveStatus('saving');
  try {
    todayLog = await upsertDailyLog({ mood: selectedMood });
    setSaveStatus('saved');
  } catch (error) {
    console.error('Error saving mood:', error);
    setSaveStatus('error');
  }
}

async function handleNotesChange() {
  const notes = dailyLogNotes.value.trim() || null;

  setSaveStatus('saving');
  try {
    todayLog = await upsertDailyLog({ notes });
    setSaveStatus('saved');
  } catch (error) {
    console.error('Error saving notes:', error);
    setSaveStatus('error');
  }
}

function setSaveStatus(state) {
  if (state === 'saving') {
    dailyLogSaveStatus.textContent = 'Saving...';
    dailyLogSaveStatus.className = 'font-medium saving';
  } else if (state === 'saved') {
    dailyLogSaveStatus.textContent = 'Saved';
    dailyLogSaveStatus.className = 'font-medium saved';
  } else if (state === 'error') {
    dailyLogSaveStatus.textContent = 'Failed to save';
    dailyLogSaveStatus.className = 'font-medium error';
  }
}

// Manage Fields Modal
function showManageFieldsModal() {
  manageFieldsModal.classList.remove('hidden');
  renderManageFieldsList();
}

function hideManageFieldsModal() {
  manageFieldsModal.classList.add('hidden');
}

function renderManageFieldsList() {
  const list = document.getElementById('manage-fields-list');
  const empty = document.getElementById('manage-fields-empty');

  if (logFields.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    list.innerHTML = logFields.map((field, index) => `
      <div class="field-item" data-field-id="${field.id}">
        <div class="flex items-center gap-2">
          <div class="flex flex-col gap-0.5">
            <button class="field-move-up p-0.5 text-gray-400 hover:text-gray-700 ${index === 0 ? 'invisible' : ''}" data-field-id="${field.id}" title="Move up">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
            </button>
            <button class="field-move-down p-0.5 text-gray-400 hover:text-gray-700 ${index === logFields.length - 1 ? 'invisible' : ''}" data-field-id="${field.id}" title="Move down">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </button>
          </div>
          <span class="font-medium text-gray-800">${escapeHtml(field.name)}</span>
          <span class="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">${field.type}</span>
        </div>
        <button class="field-delete text-red-500 hover:text-red-700 text-sm font-medium" data-field-id="${field.id}">Delete</button>
      </div>
    `).join('');

    // Attach listeners
    list.querySelectorAll('.field-delete').forEach(btn => {
      btn.addEventListener('click', handleDeleteField);
    });
    list.querySelectorAll('.field-move-up').forEach(btn => {
      btn.addEventListener('click', () => handleMoveField(btn.dataset.fieldId, -1));
    });
    list.querySelectorAll('.field-move-down').forEach(btn => {
      btn.addEventListener('click', () => handleMoveField(btn.dataset.fieldId, 1));
    });
  }
}

async function handleAddField() {
  const nameInput = document.getElementById('new-field-name');
  const typeSelect = document.getElementById('new-field-type');
  const name = nameInput.value.trim();
  const type = typeSelect.value;

  if (!name) return;

  try {
    await createLogField(name, type);
    nameInput.value = '';
    logFields = await fetchLogFields();
    renderManageFieldsList();
    renderDailyLogSection();
  } catch (error) {
    console.error('Error adding field:', error);
    alert('Failed to add field. Please try again.');
  }
}

async function handleDeleteField(e) {
  const fieldId = e.target.dataset.fieldId;
  const field = logFields.find(f => f.id === fieldId);
  if (!field) return;

  if (confirm(`Delete "${field.name}"? This will remove all historical data for this field.`)) {
    try {
      await deleteLogField(fieldId);
      logFields = await fetchLogFields();
      delete todayEntries[fieldId];
      renderManageFieldsList();
      renderDailyLogSection();
    } catch (error) {
      console.error('Error deleting field:', error);
      alert('Failed to delete field. Please try again.');
    }
  }
}

async function handleMoveField(fieldId, direction) {
  const index = logFields.findIndex(f => f.id === fieldId);
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= logFields.length) return;

  const currentOrder = logFields[index].display_order;
  const swapOrder = logFields[swapIndex].display_order;

  try {
    await Promise.all([
      updateLogFieldOrder(fieldId, swapOrder),
      updateLogFieldOrder(logFields[swapIndex].id, currentOrder)
    ]);
    logFields = await fetchLogFields();
    renderManageFieldsList();
    renderDailyLogSection();
  } catch (error) {
    console.error('Error reordering field:', error);
  }
}

// Mood helpers
function getMoodLabel(mood) {
  const labels = { 1: 'Very Bad', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Great' };
  return labels[mood] || '';
}

function getMoodEmoji(mood) {
  const emojis = { 1: '😢', 2: '😟', 3: '😐', 4: '🙂', 5: '😄' };
  return emojis[mood] || '';
}

// ========== History View ==========

function switchView(view) {
  currentView = view;
  if (view === 'history') {
    dashboardView.classList.add('hidden');
    historyView.classList.remove('hidden');
    allTasksCache = null; // Reset cache when entering history
    loadHistoryWeek();
  } else {
    historyView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
  }
}

function getWeekRange(offset) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset - (offset * 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

function dateToStr(date) {
  return date.toISOString().split('T')[0];
}

function formatDateLong(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

async function fetchAllTasksIncludingArchived() {
  if (allTasksCache) return allTasksCache;

  const { data, error } = await supabaseClient
    .from('tasks')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });

  if (error) throw error;
  allTasksCache = data || [];
  return allTasksCache;
}

async function fetchWeekCompletions(startDate, endDate) {
  const { data, error } = await supabaseClient
    .from('completions')
    .select('*')
    .gte('completed_date', startDate)
    .lte('completed_date', endDate);

  if (error) throw error;
  return data || [];
}

async function loadHistoryWeek() {
  const { start, end } = getWeekRange(historyWeekOffset);
  const startStr = dateToStr(start);
  const endStr = dateToStr(end);

  // Update week label
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  historyWeekLabel.textContent = `${startLabel} — ${endLabel}`;

  // Update nav button states
  document.getElementById('history-next-week').disabled = historyWeekOffset === 0;
  document.getElementById('history-prev-week').disabled = historyWeekOffset >= 11;

  try {
    const [allTasks, completions, logData, fields] = await Promise.all([
      fetchAllTasksIncludingArchived(),
      fetchWeekCompletions(startStr, endStr),
      fetchLogHistoryData(startStr, endStr),
      fetchLogFields()
    ]);

    logFields = fields;

    // Build completions lookup: { "taskId_date": { is_completed, failure_note } }
    const compMap = {};
    completions.forEach(c => {
      compMap[`${c.task_id}_${c.completed_date}`] = c;
    });

    // Build log lookup by date
    const logMap = {};
    logData.forEach(log => {
      logMap[log.log_date] = log;
    });

    // Build 7 day objects
    const days = [];
    for (let d = new Date(end); d >= start; d.setDate(d.getDate() - 1)) {
      const dateStr = dateToStr(d);
      const today = getTodayDate();

      // Find daily tasks active on this date
      const dailyHabits = allTasks
        .filter(t => t.type === 'daily' && t.created_at.split('T')[0] <= dateStr)
        .filter(t => !t.is_archived || completions.some(c => c.task_id === t.id && c.completed_date === dateStr))
        .map(t => {
          const comp = compMap[`${t.id}_${dateStr}`];
          return {
            title: t.title,
            completed: comp ? comp.is_completed : false,
            failureNote: comp ? comp.failure_note : null
          };
        });

      // One-time tasks completed on this date
      const onceTasksCompleted = allTasks
        .filter(t => t.type === 'once')
        .filter(t => {
          const comp = compMap[`${t.id}_${dateStr}`];
          return comp && comp.is_completed;
        })
        .map(t => ({ title: t.title }));

      // Completion percentage
      const totalDaily = dailyHabits.length;
      const completedDaily = dailyHabits.filter(h => h.completed).length;
      const completionPercentage = totalDaily > 0 ? Math.round((completedDaily / totalDaily) * 100) : 0;

      // Log data
      const log = logMap[dateStr] || null;
      let logObj = null;
      if (log) {
        const fieldValues = {};
        logFields.forEach(f => {
          const entry = log.entries ? log.entries.find(e => e.field_id === f.id) : null;
          if (entry) fieldValues[f.name] = entry.value;
        });
        logObj = {
          mood: log.mood,
          notes: log.notes,
          fields: fieldValues
        };
      }

      days.push({
        date: dateStr,
        dailyHabits,
        onceTasksCompleted,
        completionPercentage,
        totalDaily,
        completedDaily,
        log: logObj,
        isFuture: dateStr > today
      });
    }

    historyWeekData = days;
    renderHistoryWeek();
  } catch (error) {
    console.error('Error loading history week:', error);
    historyDaysContainer.innerHTML = '<p class="text-red-500 text-center py-8">Failed to load history data.</p>';
  }
}

function renderHistoryWeek() {
  if (!historyWeekData) return;

  // Week summary
  const nonFutureDays = historyWeekData.filter(d => !d.isFuture);
  const daysWithTasks = nonFutureDays.filter(d => d.totalDaily > 0);
  const avgCompletion = daysWithTasks.length > 0
    ? Math.round(daysWithTasks.reduce((s, d) => s + d.completionPercentage, 0) / daysWithTasks.length)
    : 0;
  const daysAbove80 = daysWithTasks.filter(d => d.completionPercentage >= 80).length;
  const daysWithLog = nonFutureDays.filter(d => d.log).length;
  const moodDays = nonFutureDays.filter(d => d.log && d.log.mood);
  const avgMood = moodDays.length > 0
    ? (moodDays.reduce((s, d) => s + d.log.mood, 0) / moodDays.length).toFixed(1)
    : '-';

  historyWeekSummary.innerHTML = `
    <div>
      <div class="stat-value text-blue-600">${avgCompletion}%</div>
      <div class="stat-label">Avg Completion</div>
    </div>
    <div>
      <div class="stat-value text-green-600">${daysAbove80}/${daysWithTasks.length}</div>
      <div class="stat-label">Days Above 80%</div>
    </div>
    <div>
      <div class="stat-value">${avgMood === '-' ? '-' : avgMood}</div>
      <div class="stat-label">Avg Mood</div>
    </div>
    <div>
      <div class="stat-value text-purple-600">${daysWithLog}</div>
      <div class="stat-label">Days Logged</div>
    </div>
  `;

  // Day cards
  historyDaysContainer.innerHTML = historyWeekData.map(renderHistoryDayCard).join('');
}

function renderHistoryDayCard(day) {
  if (day.isFuture) {
    return `
      <div class="history-day-card">
        <div class="history-day-header bg-gray-50 text-gray-400">
          <span>${formatDateLong(day.date)}</span>
          <span>—</span>
        </div>
      </div>
    `;
  }

  const bgColor = getColorForPercentage(day.completionPercentage);
  const hasAnyData = day.dailyHabits.length > 0 || day.onceTasksCompleted.length > 0 || day.log;

  if (!hasAnyData) {
    return `
      <div class="history-day-card">
        <div class="history-day-header ${bgColor}">
          <span>${formatDateLong(day.date)}</span>
          <span>No data</span>
        </div>
      </div>
    `;
  }

  // Daily habits section
  let habitsHtml = '';
  if (day.dailyHabits.length > 0) {
    const habitItems = day.dailyHabits.map(h => {
      if (h.completed) {
        return `<div class="history-task-item"><span class="task-icon text-green-600">&#10003;</span> ${escapeHtml(h.title)}</div>`;
      } else {
        const note = h.failureNote ? ` <span class="failure-note">— "${escapeHtml(h.failureNote)}"</span>` : '';
        return `<div class="history-task-item history-task-failed"><span class="task-icon">&#10007;</span> ${escapeHtml(h.title)}${note}</div>`;
      }
    }).join('');
    habitsHtml = `
      <div class="mb-3">
        <div class="history-section-label">Daily Habits</div>
        ${habitItems}
      </div>
    `;
  }

  // One-time tasks section
  let onceHtml = '';
  if (day.onceTasksCompleted.length > 0) {
    const onceItems = day.onceTasksCompleted.map(t =>
      `<div class="history-task-item"><span class="task-icon text-green-600">&#10003;</span> ${escapeHtml(t.title)}</div>`
    ).join('');
    onceHtml = `
      <div class="mb-3">
        <div class="history-section-label">One-Time Tasks Completed</div>
        ${onceItems}
      </div>
    `;
  }

  // Daily log section
  let logHtml = '';
  if (day.log) {
    const moodHtml = day.log.mood
      ? `<div class="history-field-item"><span class="field-label">Mood</span><div class="field-value">${getMoodEmoji(day.log.mood)} ${getMoodLabel(day.log.mood)}</div></div>`
      : '';

    const fieldEntries = Object.entries(day.log.fields || {});
    const fieldsHtml = fieldEntries.map(([name, value]) =>
      `<div class="history-field-item"><span class="field-label">${escapeHtml(name)}</span><div class="field-value">${escapeHtml(value)}</div></div>`
    ).join('');

    const notesHtml = day.log.notes
      ? `<div class="history-notes">${escapeHtml(day.log.notes)}</div>`
      : '';

    if (moodHtml || fieldsHtml || notesHtml) {
      logHtml = `
        <div>
          <div class="history-section-label">Daily Log</div>
          <div class="history-field-grid">
            ${moodHtml}
            ${fieldsHtml}
          </div>
          ${notesHtml}
        </div>
      `;
    }
  }

  return `
    <div class="history-day-card">
      <div class="history-day-header ${bgColor}">
        <span>${formatDateLong(day.date)}</span>
        <span>${day.completionPercentage}% (${day.completedDaily}/${day.totalDaily})</span>
      </div>
      <div class="history-day-body">
        ${habitsHtml}
        ${onceHtml}
        ${logHtml}
        ${!habitsHtml && !onceHtml && !logHtml ? '<p class="history-day-empty">No activity recorded</p>' : ''}
      </div>
    </div>
  `;
}

function navigateHistoryWeek(direction) {
  const newOffset = historyWeekOffset + direction;
  if (newOffset < 0 || newOffset > 11) return;
  historyWeekOffset = newOffset;
  loadHistoryWeek();
}

// Export functionality
function buildWeekSummaries(history) {
  if (history.length < 28) return [];

  const weeks = [];
  const weekNames = ['Week 1 (Most Recent)', 'Week 2', 'Week 3', 'Week 4 (Oldest)'];

  // Process in reverse to get most recent week first
  for (let i = 0; i < 4; i++) {
    const weekStart = (3 - i) * 7; // Start from oldest to newest in history array
    const weekEnd = weekStart + 7;
    const weekDays = history.slice(weekStart, weekEnd);

    const daysWithTasks = weekDays.filter(day => day.total > 0);
    const avgCompletion = daysWithTasks.length > 0
      ? Math.round(daysWithTasks.reduce((sum, day) => sum + day.percentage, 0) / daysWithTasks.length)
      : 0;

    const daysAbove80 = daysWithTasks.filter(day => day.percentage >= 80).length;

    // Format week date range
    const startDate = formatDate(weekDays[0].date);
    const endDate = formatDate(weekDays[weekDays.length - 1].date);

    weeks.unshift({ // Add to beginning to reverse order
      week: `${weekNames[i]} (${startDate} - ${endDate})`,
      avg_completion: avgCompletion,
      days_above_80_percent: daysAbove80,
      total_days: daysWithTasks.length
    });
  }

  return weeks;
}

async function buildExportData() {
  const today = getTodayDate();
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Separate today's tasks by type
  const dailyTasks = tasks.filter(t => t.type === 'daily').map(task => ({
    id: task.id,
    title: task.title,
    completed: task.completed_today,
    type: task.type
  }));

  const onceTasks = tasks.filter(t => t.type === 'once').map(task => ({
    id: task.id,
    title: task.title,
    completed: task.completed_today,
    type: task.type
  }));

  // Calculate today's summary
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed_today).length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Build week summaries from history (group into 4 weeks of 7 days each)
  const weekSummaries = buildWeekSummaries(history);

  // Find best and worst days
  const daysWithTasks = history.filter(day => day.total > 0);
  const bestDay = daysWithTasks.reduce((best, day) =>
    day.percentage > best.percentage ? day : best,
    { date: 'N/A', percentage: 0 }
  );
  const worstDay = daysWithTasks.reduce((worst, day) =>
    day.percentage < worst.percentage ? day : worst,
    { date: 'N/A', percentage: 100 }
  );

  const avgCompletionRate = daysWithTasks.length > 0
    ? Math.round(daysWithTasks.reduce((sum, day) => sum + day.percentage, 0) / daysWithTasks.length)
    : 0;

  const daysAbove80 = daysWithTasks.filter(day => day.percentage >= 80).length;

  return {
    export_metadata: {
      export_date: today,
      export_time: new Date().toISOString(),
      purpose: "AI Assistant Context"
    },
    today: {
      date: today,
      formatted_date: todayFormatted,
      daily_tasks: dailyTasks,
      one_time_tasks: onceTasks,
      summary: {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        completion_rate: completionRate,
        daily_tasks_total: dailyTasks.length,
        daily_tasks_completed: dailyTasks.filter(t => t.completed).length,
        once_tasks_total: onceTasks.length,
        once_tasks_completed: onceTasks.filter(t => t.completed).length
      }
    },
    streaks: {
      current_streak: streaks.current,
      longest_streak: streaks.longest,
      streak_explanation: "Days with ≥80% task completion"
    },
    monthly_overview: {
      period: "Last 28 days",
      week_summaries: weekSummaries,
      overall_stats: {
        avg_completion_rate: avgCompletionRate,
        best_day: {
          date: bestDay.date,
          completion_rate: bestDay.percentage
        },
        worst_day: {
          date: worstDay.date,
          completion_rate: worstDay.percentage
        },
        total_days_above_80: daysAbove80
      }
    },
    daily_log: buildDailyLogExport(),
    daily_log_history: await buildDailyLogHistoryExport(),
    context_for_ai: {
      task_types_explanation: "daily = recurring habits tracked daily, once = one-time tasks tracked until completed",
      streak_criteria: "Streak continues when daily task completion ≥80%",
      mood_scale: "1 = Very Bad, 2 = Bad, 3 = Okay, 4 = Good, 5 = Great",
      daily_log_fields: "User-configured tracking fields with types (time/number/text). Field values provide daily context for pattern analysis.",
      data_freshness: "All data reflects current state at export time"
    }
  };
}

function buildDailyLogExport() {
  if (!todayLog && Object.keys(todayEntries).length === 0) return null;

  const fields = {};
  logFields.forEach(f => {
    if (todayEntries[f.id]) {
      fields[f.name] = todayEntries[f.id];
    }
  });

  return {
    mood: todayLog?.mood || null,
    mood_label: todayLog?.mood ? getMoodLabel(todayLog.mood) : null,
    notes: todayLog?.notes || null,
    fields: Object.keys(fields).length > 0 ? fields : null
  };
}

async function buildDailyLogHistoryExport() {
  // Fetch fresh 28-day log data for export (independent of history view state)
  const today = getTodayDate();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 27);
  const startStr = startDate.toISOString().split('T')[0];

  let exportLogHistory;
  try {
    exportLogHistory = await fetchLogHistoryData(startStr, today);
  } catch (error) {
    console.error('Error fetching log history for export:', error);
    return null;
  }

  if (exportLogHistory.length === 0) return null;

  const entries = exportLogHistory.map(log => {
    const fields = {};
    logFields.forEach(f => {
      const entry = log.entries.find(e => e.field_id === f.id);
      if (entry) fields[f.name] = entry.value;
    });

    return {
      date: log.log_date,
      mood: log.mood,
      mood_label: log.mood ? getMoodLabel(log.mood) : null,
      notes: log.notes,
      fields: Object.keys(fields).length > 0 ? fields : null
    };
  });

  return {
    period: "Last 28 days",
    fields_tracked: logFields.map(f => f.name),
    entries,
    patterns: calculateLogPatterns(exportLogHistory)
  };
}

function calculateLogPatterns(logs) {
  if (logs.length === 0) return null;

  const moodsRecorded = logs.filter(l => l.mood !== null);
  const avgMood = moodsRecorded.length > 0
    ? parseFloat((moodsRecorded.reduce((sum, l) => sum + l.mood, 0) / moodsRecorded.length).toFixed(1))
    : null;

  // Mood trend: compare first half vs second half
  let moodTrend = null;
  if (moodsRecorded.length >= 4) {
    const sorted = [...moodsRecorded].sort((a, b) => a.log_date.localeCompare(b.log_date));
    const mid = Math.floor(sorted.length / 2);
    const firstAvg = sorted.slice(0, mid).reduce((s, l) => s + l.mood, 0) / mid;
    const secondAvg = sorted.slice(mid).reduce((s, l) => s + l.mood, 0) / (sorted.length - mid);

    if (secondAvg > firstAvg + 0.3) moodTrend = 'improving';
    else if (secondAvg < firstAvg - 0.3) moodTrend = 'declining';
    else moodTrend = 'stable';
  }

  // Field averages (for time and number fields)
  const fieldAverages = {};
  logFields.forEach(f => {
    const values = logs
      .map(l => l.entries.find(e => e.field_id === f.id))
      .filter(e => e && e.value);

    if (values.length === 0) return;

    if (f.type === 'number') {
      const nums = values.map(e => parseFloat(e.value)).filter(n => !isNaN(n));
      if (nums.length > 0) {
        fieldAverages[f.name] = parseFloat((nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1));
      }
    } else if (f.type === 'time') {
      const minutes = values.map(e => {
        const [h, m] = e.value.split(':').map(Number);
        return h * 60 + m;
      }).filter(n => !isNaN(n));
      if (minutes.length > 0) {
        const avgMin = Math.round(minutes.reduce((s, n) => s + n, 0) / minutes.length);
        fieldAverages[f.name] = `${Math.floor(avgMin / 60).toString().padStart(2, '0')}:${(avgMin % 60).toString().padStart(2, '0')}`;
      }
    }
  });

  return {
    avg_mood: avgMood,
    mood_trend: moodTrend,
    days_logged: logs.length,
    field_averages: Object.keys(fieldAverages).length > 0 ? fieldAverages : null
  };
}

async function handleExportToClipboard() {
  try {
    const exportData = await buildExportData();
    const jsonString = JSON.stringify(exportData, null, 2);

    // Use Clipboard API (modern approach)
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(jsonString);
      showCopyToast(true);
    } else {
      // Fallback for older browsers or non-HTTPS
      const textArea = document.createElement('textarea');
      textArea.value = jsonString;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand('copy');
      textArea.remove();

      if (successful) {
        showCopyToast(true);
      } else {
        throw new Error('Fallback copy failed');
      }
    }
  } catch (error) {
    console.error('Error exporting to clipboard:', error);
    showCopyToast(false, error.message);
  }
}

function showCopyToast(success, errorMsg = '') {
  const toast = document.getElementById('copy-toast');

  if (success) {
    toast.className = 'fixed bottom-8 right-8 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 z-50';
    toast.innerHTML = `
      <p class="font-semibold">✓ Copied to clipboard!</p>
      <p class="text-sm">Ready to paste into your AI chat</p>
    `;
  } else {
    toast.className = 'fixed bottom-8 right-8 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 z-50';
    toast.innerHTML = `
      <p class="font-semibold">✗ Copy failed</p>
      <p class="text-sm">${escapeHtml(errorMsg || 'Please try again')}</p>
    `;
  }

  toast.classList.remove('hidden');

  // Auto-hide after 3 seconds
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}
