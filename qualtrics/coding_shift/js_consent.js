// Consent page: wakes the service so it is awake by the time a note is sent, and clears any state
// left in sessionStorage by an earlier preview in the same tab.
Qualtrics.SurveyEngine.addOnload(function () {
  var SERVICE_URL = "https://YOUR-SERVICE.onrender.com";
  try { fetch(SERVICE_URL + "/api/health", { method: "GET", mode: "cors", cache: "no-store" }).catch(function () {}); } catch (error) {}
  try {
    Object.keys(sessionStorage).forEach(function (key) { if (key.indexOf("cs_") === 0) sessionStorage.removeItem(key); });
  } catch (error) {}
});
