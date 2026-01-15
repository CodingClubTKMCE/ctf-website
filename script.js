const API_BASE = "https://ctf-backend-ten.vercel.app/api";

const output = document.getElementById("output");
/** @type {HTMLInputElement} */
const input = document.getElementById("terminal-input");
const promptText = document.getElementById("prompt-text");

const commands = {
	help: "Show available commands and their descriptions",
	login: "Login with your Coding Club account",
	whoami: "Display current user information",
	task: "Get the current question (requires login)",
	hint: "Get a hint for the current task (There is a 10m penalty!)",
	submit: "Submit a flag (requires login)",
	progress: "Your current progress",
	leaderboard: "Display the CTF leaderboard",
	banner: "Display the CTF banner",
	clear: "Clear the terminal screen",
	exit: "Logout from the current session",
};
const banner = `<span style="color: #1e1e1e;">CC{H1DD3N_1N_9LA1N_51GH7}</span>`;

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} emailID
 * @property {string} branch
 * @property {string} year
 */

/**
 * @typedef {Object} CTFProgress
 * @property {number} currLevel
 * @property {number} totalTimeTaken
 * @property {number} availableHints
 * @property {number[]} hintsUsed
 * @property {string | null} currentQuestionStartTime
 */

let token = null;
let isLoggedIn = false;
/** @type {User | null} */
let currentUser = null;
/** @type {CTFProgress | null} */
let userProgress = null;
let awaitingInput = false;
let inputCallback = null;
let commandHistory = [];
let historyIndex = -1;

function logout() {
	token = null;
	isLoggedIn = false;
	currentUser = null;
	userProgress = null;
	localStorage.removeItem("token");
	localStorage.removeItem("cmd-history");
}

document.addEventListener("click", (e) => {
	const selection = window.getSelection();
	if (selection && selection.toString().length > 0) return;
	if (selection.type !== "Caret") return;
	input.focus();
});

document.addEventListener("DOMContentLoaded", async () => {
	showBanner();

	const storedToken = localStorage.getItem("token");
	if (typeof storedToken === "string" && storedToken.length > 0) {
		addOutput("Authenticating...");

		input.disabled = true;

		try {
			const response = await fetch(`${API_BASE}/auth/details`, {
				headers: { Authorization: "Bearer " + storedToken },
			});

			const data = await response.json();
			if (response.ok && data.success) {
				token = storedToken;
				isLoggedIn = true;
				currentUser = data.user;
				userProgress = data.ctfProgress;
				addOutput(`Logged in as <b>${data.user.emailID}</b>`, "success");

				// preserved command history if any
				const storedCommandHistory = localStorage.getItem("cmd-history");
				if (typeof storedCommandHistory == "string" && storedCommandHistory.length >= 2) {
					try {
						const parsed = JSON.parse(storedCommandHistory);
						if (Array.isArray(parsed)) {
							commandHistory = parsed.filter((cmd) => typeof cmd === "string" && cmd.length > 0);
							historyIndex = commandHistory.length;
						}
					} catch {
						// do nothing, just keep it empty
					}
				}
			} else {
				logout();
				addOutput("Something went wrong while authenticating :(", "error");
				addOutput("Type <span class=\"command\">'login'</span> to authenticate\n", "info");
			}
		} catch (error) {
			if (error instanceof Error && error.message) {
				addOutput("Error: " + error.message, "error");
			}
			addOutput("Something went wrong while authenticating :(", "error");
			addOutput("Type <span class=\"command\">'login'</span> to authenticate\n", "info");
		} finally {
			input.disabled = false;
			input.focus();
		}
	} else {
		logout();
		addOutput("Type <span class=\"command\">'login'</span> to begin\n", "info");
	}
});

function addOutput(text, className = "") {
	const line = document.createElement("div");
	line.className = `output-line ${className}`;
	line.innerHTML = text;
	output.appendChild(line);
	scrollToBottom();
}

function scrollToBottom() {
	const body = document.getElementById("terminal-body");
	body.scrollTop = body.scrollHeight;
}

function updatePrompt(text) {
	promptText.textContent = text;
}

function waitForInput(callback, prompt) {
	awaitingInput = true;
	inputCallback = callback;
	updatePrompt(prompt);
}

function showBanner() {
	addOutput(`<pre class="ascii-art">${banner}</pre>`);
	addOutput("<b>Welcome to CTF Terminal!</b>", "info");
}

function showHelp() {
	addOutput('\n<span class="info">Available Commands:</span>');
	addOutput("─".repeat(60));
	for (const [cmd, desc] of Object.entries(commands)) {
		addOutput(`  <span class="command">${cmd.padEnd(15)}</span> - ${desc}`);
	}
	addOutput("─".repeat(60) + "\n");
}

async function handleLogin() {
	if (isLoggedIn) {
		addOutput("Already logged in, please logout first using <span class='command'>exit</span> command", "error");
		return;
	}

	addOutput(
		"Login with your <a class='link' href='https://www.codingclubtkmce.in/login' target='_blank'>Coding Club</a> account:",
		"info"
	);

	// Get email
	const email = await new Promise((resolve) => {
		waitForInput(resolve, "Email:");
	});

	// Get password
	const password = await new Promise((resolve) => {
		input.type = "password";
		waitForInput(resolve, "Password:");
	});

	input.type = "text";
	updatePrompt("root@ctf:~$");

	input.disabled = true;
	addOutput("Validating credentials...\n", "info");

	try {
		const res = await fetch(`${API_BASE}/auth/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ emailID: email, password }),
		});

		const data = await res.json();

		if (data.success) {
			localStorage.setItem("token", data.token);
			token = data.token;
			isLoggedIn = true;
			currentUser = data.user;
			addOutput(`<span class="success">✓ AUTHENTICATED</span>`, "success");
			// addOutput(`Type <span class="command">"start"</span> to begin the CTF challenge`, 'info');
			// addOutput(`Type <span class="command">"leaderboard"</span> to view rankings\n`, 'info');
			addOutput(`Type <span class="command">"help"</span> to view available commands\n`, "info");
		} else {
			addOutput(`<span class="error">✗ ${data.message}</span>\n`, "error");
		}
	} catch (err) {
		addOutput(`<span class="error">✗ Login failed: ${err.message}</span>\n`, "error");
	} finally {
		input.disabled = false;
		input.focus();
	}
}

async function startChallenge() {
	if (!isLoggedIn) {
		addOutput('✗ Please login first using the <span class="command">login</span> command.\n', "error");
		return;
	}

	try {
		input.disabled = true;
		addOutput("Fetching task from server...\n", "info");

		const res = await fetch(`${API_BASE}/ctf/question`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		const data = await res.json();

		if (data.success) {
			if (data.completed) {
				addOutput(`\n<span class="success">🎉 ${data.message}</span>`, "success");
				addOutput(`Total Levels: ${data.totalLevels}`, "info");
				addOutput(`Time: ${formatDuration(data.totalTimeTaken)}\n`, "info");
				userProgress.currentQuestionStartTime = null;
			} else {
				userProgress.currentQuestionStartTime = new Date().toISOString();
				addOutput(`<span class="info">[Question ${data.level}]</span>`, "info");

				if (data.story) {
					addOutput(`<div class="story">${data.story}</div>`);
				}

				if (data.question) {
					addOutput(`<div class="question">${data.question}</div>`);
				}

				if (data.link) {
					addOutput(
						`<div>Download: <a href="${data.link}" target="_blank" class="link">{Click Here}</a></div>`
					);
				}

				if (data.isFinalStory) {
					addOutput(`\nCongratulations! You've completed all challenges!`, "success");
					addOutput(`Time taken: ${formatDuration(data.totalTimeTaken)}\n`, "info");
				} else {
					addOutput("");
				}
			}
		} else {
			addOutput(`<span class="error">✗ ${data.message}</span>\n`, "error");
		}
	} catch (err) {
		addOutput(`<span class="error">✗ Failed to fetch question: ${err.message}</span>\n`, "error");
	}

	input.disabled = false;
	input.focus();
}

async function getHint() {
	if (!isLoggedIn) {
		addOutput('✗ Please login first using the <span class="command">login</span> command.\n', "error");
		return;
	}

	try {
		const response = await fetch(`${API_BASE}/ctf/hint`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		const data = await response.json();
		if (response.ok && data.success) {
			if (data.completed) {
				addOutput(data.message, "success");
				userProgress.currentQuestionStartTime = null;
			} else {
				addOutput(data.message, "success");
				userProgress.currentQuestionStartTime = new Date().toISOString();
				if (data.hint) {
					addOutput("Hint for the current question:", "info");
					addOutput(data.hint);
					addOutput("");
				}

				if (data.availableHints > 0) {
					addOutput(`You have ${data.availableHints} more hints.`, "info");
				} else {
					addOutput(`You have no more hints left!`, "error");
				}
			}
		} else {
			addOutput(data.message, "error");
			if (data.message === "You are not currently solving a task.") {
				userProgress.currentQuestionStartTime = null;
			}
		}
	} catch (error) {
		addOutput("Error: " + error.message, "error");
	}
}

async function submitCommand() {
	if (!isLoggedIn || userProgress == null) {
		addOutput('<span class="error">✗ Please login first.</span>\n', "error");
		return;
	}

	if (userProgress.currentQuestionStartTime == null) {
		addOutput("You are not currently solving a task", "error");
		return;
	}

	const flag = await new Promise((resolve) => {
		waitForInput(resolve, "Submit flag:");
	});

	updatePrompt("root@ctf:~$");

	if (!flag || !flag.trim()) {
		addOutput('<span class="error">✗ Flag cannot be empty</span>\n', "error");
		return;
	}

	input.disabled = true;

	try {
		const res = await fetch(`${API_BASE}/ctf/check-flag`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ flag: flag.trim() }),
		});

		const data = await res.json();

		if (data.success) {
			addOutput(`✓ Correct flag!\n`, "success");
			userProgress.currentQuestionStartTime = null;

			if (!data.completed && !data.isLastFlag) {
				addOutput('Type <span class="command">task</span> for next task!\n', "info");
			} else if (data.isLastFlag) {
				userProgress.currentQuestionStartTime = null;
				addOutput('Type <span class="command">task</span> to see the final story!\n', "info");
			}
		} else {
			addOutput(`<span class="error">✗ ${data.message}</span>\n`, "error");
		}
	} catch (err) {
		addOutput(`<span class="error">✗ Failed to submit flag: ${err.message}</span>\n`, "error");
	}

	input.disabled = false;
	input.focus();
}

async function getProgress() {
	if (!isLoggedIn) {
		addOutput('✗ Please login first using the <span class="command">login</span> command.\n', "error");
		return;
	}

	input.disabled = true;

	try {
		const response = await fetch(`${API_BASE}/auth/details`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		const data = await response.json();
		if (response.ok && data.success) {
			userProgress = data.ctfProgress;
			addOutput(`<b>Current level</b>: ${userProgress.currLevel}`);
			addOutput(`<b>Total time taken</b>: ${formatDuration(data.ctfProgress.totalTimeTaken)}`);
			addOutput(`<b>Available hints</b>: ${data.ctfProgress.availableHints} / 3`);
		} else {
			addOutput(data.message, "error");
		}
	} catch (error) {
		addOutput("Error: " + error.message, "error");
	}

	input.disabled = false;
	input.focus();
}

async function showLeaderboard() {
	input.disabled = true;

	try {
		const res = await fetch(`${API_BASE}/ctf/leaderboard`);
		const data = await res.json();

		if (data.success) {
			addOutput('\n<span class="info">═══ CTF Leaderboard ═══</span>', "info");

			if (data.data.length === 0) {
				addOutput("No participants yet.\n", "info");

				input.disabled = false;
				input.focus();
				return;
			}

			const table = document.createElement("table");
			table.className = "table";

			const thead = `
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Branch</th>
                <th>Year</th>
                <th>Questions Solved</th>
                <th>Time Taken</th>
              </tr>
            </thead>
          `;

			let tbody = "<tbody>";
			data.data.forEach((user) => {
				const time = user.timeTakenFormatted
					? `${String(user.timeTakenFormatted.hours).padStart(2, "0")}:${String(
						user.timeTakenFormatted.minutes
					).padStart(2, "0")}:${String(user.timeTakenFormatted.seconds).padStart(2, "0")}`
					: "N/A";

				tbody += `
              <tr>
                <td>${user.rank}</td>
                <td>${user.name}</td>
                <td>${user.department}</td>
                <td>${user.year}</td>
                <td>${user.numberOfLevelsCompleted}</td>
                <td>${time}</td>
              </tr>
            `;
			});
			tbody += "</tbody>";

			table.innerHTML = thead + tbody;

			const wrapper = document.createElement("div");
			wrapper.appendChild(table);
			output.appendChild(wrapper);
			addOutput("");
			scrollToBottom();
		} else {
			addOutput(`<span class="error">✗ ${data.message}</span>\n`, "error");
		}
	} catch (err) {
		addOutput(`<span class="error">✗ Failed to fetch leaderboard: ${err.message}</span>\n`, "error");
	}

	input.disabled = false;
	input.focus();
}

function whoami() {
	if (!isLoggedIn) {
		addOutput(
			'<span class="error">✗ Not logged in. Use <span class="command">login</span> command.</span>\n',
			"error"
		);
		return;
	}

	addOutput(`Name: <b>${currentUser.name}</b>`, "info");
	addOutput(`Email: <b>${currentUser.emailID}</b>`, "info");
	addOutput(`Branch: <b>${currentUser.branch}</b>`, "info");
	addOutput(`Year: <b>${currentUser.year}</b>\n`, "info");
}

function formatDuration(duration) {
	const hours = Math.floor(duration / 3600000);
	const minutes = Math.floor((duration % 3600000) / 60000);
	const seconds = Math.floor((duration % 60000) / 1000);
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function calculateTimeDiff(start, end) {
	if (!start || !end) return "N/A";
	const diff = new Date(end) - new Date(start);
	return formatDuration(diff);
}

async function handleCommand(cmd) {
	const [command, ...args] = cmd.trim().split(" ");

	addOutput(`<span class="prompt">root@ctf:~$</span> <span class="command">${cmd}</span>`);

	// Add to command history
	if (cmd.trim() && (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== cmd)) {
		commandHistory.push(cmd);
	}
	historyIndex = commandHistory.length;

	localStorage.setItem("cmd-history", JSON.stringify(commandHistory.slice(-20)));

	switch (command.toLowerCase()) {
		case "help":
			showHelp();
			break;
		case "login":
			await handleLogin();
			break;
		case "task":
			await startChallenge();
			break;
		case "hint":
			await getHint();
			break;
		case "submit":
			await submitCommand();
			break;
		case "leaderboard":
			await showLeaderboard();
			break;
		case "whoami":
			whoami();
			break;
		case "progress":
			await getProgress();
			break;
		case "clear":
			output.innerHTML = "";
			break;
		case "banner":
			showBanner();
			break;
		case "exit":
			if (isLoggedIn) {
				logout();
				output.innerHTML = "";
				addOutput('<span class="success">✓ Logged out successfully.</span>\n', "success");
			} else {
				addOutput('<span class="error">✗ Not logged in.</span>\n', "error");
			}
			break;
		case "":
			break;
		case "about":
			addOutput("<b>BitBlitz OS v1.729</b>", "info");
			addOutput("Credits: Claude, ChatGPT, Alan Saji, Swassy, <a href='https://github.com/aswan-a' target='_blank'>Aswan</a> and <a href='https://github.com/dcdunkan' target='_blank'>Dunks</a>!");
			break;
		default:
			addOutput(`<span class="error">Command not found: ${command}</span>`, "error");
			addOutput('Type <span class="command">help</span> for available commands.\n', "info");
	}
}

input.addEventListener("keydown", async (e) => {
	// Handle up/down arrow for command history
	if (e.key === "ArrowUp") {
		e.preventDefault();
		if (commandHistory.length > 0 && historyIndex > 0) {
			historyIndex--;
			input.value = commandHistory[historyIndex];
		}
	} else if (e.key === "ArrowDown") {
		e.preventDefault();
		if (historyIndex < commandHistory.length - 1) {
			historyIndex++;
			input.value = commandHistory[historyIndex];
		} else {
			historyIndex = commandHistory.length;
			input.value = "";
		}
	} else if (e.key === "Enter") {
		const cmd = input.value;
		input.value = "";

		if (awaitingInput && inputCallback) {
			awaitingInput = false;
			const callback = inputCallback;
			inputCallback = null;
			callback(cmd);
		} else {
			await handleCommand(cmd);
		}
	}
});
