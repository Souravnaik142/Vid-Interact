const video = document.getElementById("videoPlayer");
const localVideo = document.getElementById("localVideo");
const youtubeUrl = document.getElementById("youtubeUrl");
const loadYoutube = document.getElementById("loadYoutube");
const currentTimeDisplay = document.getElementById("currentTime");
const adminMode = document.getElementById("adminMode");
const adminPanel = document.getElementById("adminPanel");
const useCurrentTime = document.getElementById("useCurrentTime");
const addAllInteractions = document.getElementById("addAllInteractions");
const interactionTime = document.getElementById("interactionTime");
const interactionList = document.getElementById("interactionList");
const overlay = document.getElementById("overlay");
const interactionContent = document.getElementById("interactionContent");
const skipBtn = document.getElementById("skipBtn");
const checkBtn = document.getElementById("checkBtn");

let interactions = [];

// Load local video
localVideo.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    video.src = URL.createObjectURL(file);
  }
});

// Load YouTube video
loadYoutube.addEventListener("click", () => {
  const url = youtubeUrl.value.trim();
  if (url.includes("v=")) {
    const id = url.split("v=")[1];
    video.src = `https://www.youtube.com/embed/${id}`;
  } else {
    alert("Invalid YouTube URL");
  }
});

// Admin toggle
adminMode.addEventListener("change", () => {
  adminPanel.classList.toggle("hidden", !adminMode.checked);
});

// Use current time
useCurrentTime.addEventListener("click", () => {
  interactionTime.value = video.currentTime.toFixed(2);
});

// Add all interactions
addAllInteractions.addEventListener("click", () => {
  const time = parseFloat(interactionTime.value);
  if (isNaN(time)) return alert("Enter valid time");

  const all = {
    time,
    mcq: {
      q: mcqQuestion.value,
      options: [mcqA.value, mcqB.value, mcqC.value, mcqD.value],
      ans: mcqAnswer.value.toUpperCase(),
    },
    fill: {
      q: fillQuestion.value,
      ans: fillAnswer.value,
      hint: fillHint.value,
    },
    tf: {
      q: tfQuestion.value,
      ans: tfAnswer.value,
    },
    match: matchPairs.value,
    color: {
      title: colorTitle.value,
      hint: colorHint.value,
    },
  };

  interactions.push(all);
  renderList();
});

function renderList() {
  interactionList.innerHTML = "";
  interactions.forEach((i, idx) => {
    const li = document.createElement("li");
    li.textContent = `#${idx + 1} - All interactions @ ${i.time}s`;
    interactionList.appendChild(li);
  });
}

// Track time
video.addEventListener("timeupdate", () => {
  currentTimeDisplay.textContent = `${video.currentTime.toFixed(2)}s`;
  checkForInteraction(video.currentTime);
});

// Show interaction popup
function checkForInteraction(time) {
  const inter = interactions.find((i) => Math.abs(i.time - time) < 0.5);
  if (inter) showPopup(inter);
}

function showPopup(inter) {
  video.pause();
  overlay.classList.remove("hidden");

  interactionContent.innerHTML = `
    <h3>Multiple Choice</h3>
    <p>${inter.mcq.q}</p>
    ${inter.mcq.options.map((opt, i) => `
      <label><input type="radio" name="mcq"> ${opt}</label><br>
    `).join("")}

    <hr><h3>Fill in the Blank</h3>
    <p>${inter.fill.q}</p>
    <input type="text" placeholder="${inter.fill.hint}" />

    <hr><h3>True / False</h3>
    <p>${inter.tf.q}</p>
    <label><input type="radio" name="tf"> True</label>
    <label><input type="radio" name="tf"> False</label>

    <hr><h3>Match the Following</h3>
    <pre>${inter.match}</pre>

    <hr><h3>Colour the Diagram</h3>
    <p>${inter.color.title}</p>
    <p>Hint: ${inter.color.hint}</p>
  `;
}

skipBtn.addEventListener("click", () => {
  overlay.classList.add("hidden");
  video.play();
});

checkBtn.addEventListener("click", () => {
  alert("Answers recorded (demo)");
  overlay.classList.add("hidden");
  video.play();
});
