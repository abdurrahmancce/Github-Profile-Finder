/**
 * GitFinder — script.js
 * ───────────────────────────────────────────────────────────
 * GitHub Profile Finder using the GitHub REST API.
 * Features: search, async fetch, error handling, localStorage,
 *           Enter-key support, debounce, animations.
 * ───────────────────────────────────────────────────────────
 */

/* ── DOM References ───────────────────────────────────────── */
const usernameInput  = document.getElementById('usernameInput');
const searchBtn      = document.getElementById('searchBtn');
const loading        = document.getElementById('loading');
const errorCard      = document.getElementById('errorCard');
const errorMsg       = document.getElementById('errorMsg');
const results        = document.getElementById('results');
const lastSearched   = document.getElementById('lastSearched');
const lastSearchBtn  = document.getElementById('lastSearchBtn');

// Profile fields
const avatarEl       = document.getElementById('avatar');
const nameEl         = document.getElementById('name');
const usernameLink   = document.getElementById('usernameLink');
const bioEl          = document.getElementById('bio');
const locationItem   = document.getElementById('locationItem');
const locationText   = document.getElementById('locationText');
const blogItem       = document.getElementById('blogItem');
const blogText       = document.getElementById('blogText');
const twitterItem    = document.getElementById('twitterItem');
const twitterText    = document.getElementById('twitterText');
const repoCount      = document.getElementById('repoCount');
const followerCount  = document.getElementById('followerCount');
const followingCount = document.getElementById('followingCount');
const gistCount      = document.getElementById('gistCount');
const joinedDate     = document.getElementById('joinedDate');

// Repos
const reposGrid      = document.getElementById('reposGrid');
const viewAllLink    = document.getElementById('viewAllLink');

/* ── State ────────────────────────────────────────────────── */
let debounceTimer = null;   // for optional debounce
let isFetching    = false;  // prevent duplicate requests

/* ── GitHub API Base URL ──────────────────────────────────── */
const API_BASE = 'https://api.github.com';

/* ══════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
══════════════════════════════════════════════════════════ */

/**
 * Format large numbers: 1200 → "1.2k", 1500000 → "1.5m"
 */
function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'm';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

/**
 * Format an ISO date string to a readable format.
 * e.g. "2015-03-22T12:00:00Z" → "March 22, 2015"
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Trim a URL for display (remove https:// and trailing slashes).
 */
function trimUrl(url) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * Save last searched username to localStorage.
 */
function saveLastSearch(username) {
  try {
    localStorage.setItem('gitfinder_last', username);
  } catch (_) {
    // localStorage might be blocked in some environments — fail silently
  }
}

/**
 * Load last searched username from localStorage.
 */
function loadLastSearch() {
  try {
    return localStorage.getItem('gitfinder_last') || null;
  } catch (_) {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════
   UI STATE HELPERS
══════════════════════════════════════════════════════════ */

/** Show the loading spinner, hide others. */
function showLoading() {
  loading.hidden  = false;
  errorCard.hidden = true;
  results.hidden   = true;
}

/** Hide the loading spinner. */
function hideLoading() {
  loading.hidden = true;
}

/**
 * Show an error message card.
 * @param {string} message  Human-friendly error text.
 */
function showError(message) {
  errorMsg.textContent = message;
  errorCard.hidden     = false;
  results.hidden       = true;
  // Force reflow so the animation replays each time
  errorCard.style.animation = 'none';
  void errorCard.offsetHeight;           // trigger reflow
  errorCard.style.animation = '';
}

/** Hide both error and results. */
function clearUI() {
  errorCard.hidden = true;
  results.hidden   = true;
}

/* ══════════════════════════════════════════════════════════
   RENDER FUNCTIONS
══════════════════════════════════════════════════════════ */

/**
 * Populate the profile card with user data from the API.
 * @param {Object} user  Data object from /users/{username}
 */
function renderProfile(user) {
  // Avatar
  avatarEl.src = user.avatar_url;
  avatarEl.alt = `${user.login}'s avatar`;

  // Name + username
  nameEl.textContent       = user.name || user.login;
  usernameLink.textContent = `@${user.login}`;
  usernameLink.href        = user.html_url;

  // Bio
  bioEl.textContent = user.bio || '';
  bioEl.hidden      = !user.bio;

  // Location
  if (user.location) {
    locationText.textContent = user.location;
    locationItem.hidden      = false;
  } else {
    locationItem.hidden = true;
  }

  // Blog / website
  if (user.blog) {
    blogText.textContent = trimUrl(user.blog);
    blogItem.href        = user.blog.startsWith('http') ? user.blog : `https://${user.blog}`;
    blogItem.hidden      = false;
  } else {
    blogItem.hidden = true;
  }

  // Twitter
  if (user.twitter_username) {
    twitterText.textContent = `@${user.twitter_username}`;
    twitterItem.hidden      = false;
  } else {
    twitterItem.hidden = true;
  }

  // Stats
  repoCount.textContent      = formatNumber(user.public_repos);
  followerCount.textContent  = formatNumber(user.followers);
  followingCount.textContent = formatNumber(user.following);
  gistCount.textContent      = formatNumber(user.public_gists);

  // Joined date
  joinedDate.textContent = `Joined ${formatDate(user.created_at)}`;

  // "View all" button
  viewAllLink.href = `${user.html_url}?tab=repositories`;
}

/**
 * Build and insert repository cards.
 * @param {Array}  repos   Array of repo objects from /users/{username}/repos
 * @param {string} login   User's login (for the "view all" link)
 */
function renderRepos(repos, login) {
  // Clear any previous repo cards
  reposGrid.innerHTML = '';

  // Sort by stars descending, then show up to 10
  const sorted = repos
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 10);

  if (sorted.length === 0) {
    reposGrid.innerHTML = `<p style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);padding:1rem 0;">
      No public repositories yet.
    </p>`;
    return;
  }

  sorted.forEach((repo, index) => {
    const card = document.createElement('div');
    card.className = 'repo-card';
    // Stagger the reveal animation for each card
    card.style.animationDelay = `${index * 0.05}s`;

    // Language dot color
    const langColor = repo.language
      ? `data-lang="${repo.language}"`
      : `data-lang="default"`;

    // Build the card's inner HTML
    card.innerHTML = `
      <!-- Repo name with link icon -->
      <div class="repo-name">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54
            6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16
            2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5
            4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0
            0 9 18.13V22"/>
        </svg>
        <a href="${repo.html_url}" target="_blank" rel="noopener" title="${repo.name}">
          ${repo.name}
        </a>
      </div>

      <!-- Description -->
      <p class="repo-desc">${repo.description || '<span style="opacity:.4">No description</span>'}</p>

      <!-- Footer: language + stars + forks -->
      <div class="repo-footer">
        ${repo.language ? `
          <span class="repo-lang">
            <span class="lang-dot" ${langColor}></span>
            ${repo.language}
          </span>` : ''}

        <span class="repo-stat" title="Stars">
          <span>⭐</span> ${formatNumber(repo.stargazers_count)}
        </span>

        <span class="repo-stat" title="Forks">
          <span>🍴</span> ${formatNumber(repo.forks_count)}
        </span>
      </div>
    `;

    reposGrid.appendChild(card);
  });
}

/* ══════════════════════════════════════════════════════════
   MAIN FETCH FUNCTION
══════════════════════════════════════════════════════════ */

/**
 * Fetch GitHub user data + repos, then render everything.
 * @param {string} username  GitHub username to look up.
 */
async function fetchGitHubProfile(username) {
  // Sanitize
  username = username.trim();
  if (!username) return;

  // Prevent duplicate requests
  if (isFetching) return;
  isFetching = true;

  // Show loading state
  showLoading();

  try {
    // ── 1. Fetch user profile ────────────────────────────
    const userRes = await fetch(`${API_BASE}/users/${username}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    // Handle HTTP errors
    if (!userRes.ok) {
      if (userRes.status === 404) {
        throw new Error(`User "${username}" not found. Check the spelling and try again.`);
      } else if (userRes.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Please wait a minute and try again.');
      } else {
        throw new Error(`Something went wrong (HTTP ${userRes.status}). Please try again.`);
      }
    }

    const user = await userRes.json();

    // ── 2. Fetch repos (sort by updated, get up to 30) ──
    const reposRes = await fetch(
      `${API_BASE}/users/${username}/repos?per_page=30&sort=updated`,
      { headers: { 'Accept': 'application/vnd.github.v3+json' } }
    );

    let repos = [];
    if (reposRes.ok) {
      repos = await reposRes.json();
    }
    // (We don't fail hard if repos fetch fails — profile is still shown)

    // ── 3. Render ────────────────────────────────────────
    hideLoading();
    renderProfile(user);
    renderRepos(repos, user.login);

    // Show results section
    results.hidden = false;
    // Force re-animation
    results.style.animation = 'none';
    void results.offsetHeight;
    results.style.animation = '';

    // ── 4. Save to localStorage ──────────────────────────
    saveLastSearch(username);
    updateLastSearchedBadge(username);

  } catch (err) {
    hideLoading();
    showError(err.message || 'An unexpected error occurred. Please try again.');
    console.error('[GitFinder]', err);

  } finally {
    isFetching = false;
  }
}

/* ══════════════════════════════════════════════════════════
   LAST SEARCHED BADGE
══════════════════════════════════════════════════════════ */

/**
 * Show or update the "last searched" badge with a username.
 * Clicking it re-runs the search.
 * @param {string} username
 */
function updateLastSearchedBadge(username) {
  lastSearchBtn.textContent = `@${username}`;
  lastSearched.hidden       = false;
}

// Click handler for the badge
lastSearchBtn.addEventListener('click', () => {
  const name = lastSearchBtn.textContent.replace('@', '');
  usernameInput.value = name;
  fetchGitHubProfile(name);
});

/* ══════════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════════ */

// Search button click
searchBtn.addEventListener('click', () => {
  fetchGitHubProfile(usernameInput.value);
});

// Enter key press in the input
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    fetchGitHubProfile(usernameInput.value);
  }
});

// Clear error/results when user starts typing
usernameInput.addEventListener('input', () => {
  if (usernameInput.value.trim() === '') {
    clearUI();
  }
});

/* ══════════════════════════════════════════════════════════
   INIT — Restore last search on page load
══════════════════════════════════════════════════════════ */

(function init() {
  const last = loadLastSearch();
  if (last) {
    updateLastSearchedBadge(last);
    // Optionally pre-fill the input
    usernameInput.value = last;
  }
  // Auto-focus the input for convenience
  usernameInput.focus();
})();