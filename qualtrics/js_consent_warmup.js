// Consent page: question JavaScript.
// Wakes the free Render instance so it is awake by the time the participant reaches the waiting
// page (a sleeping free instance takes up to a minute to answer its first request).
// Replace SERVICE_URL with the deployed service origin, no trailing slash.
Qualtrics.SurveyEngine.addOnload(function () {
  var SERVICE_URL = "https://YOUR-SERVICE.onrender.com";
  try {
    fetch(SERVICE_URL + "/api/health", { method: "GET", mode: "cors", cache: "no-store" }).catch(function () {});
  } catch (error) {}
});
