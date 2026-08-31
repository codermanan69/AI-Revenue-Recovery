function getRecommendation(failureReason) {
  const reason = failureReason.toLowerCase();

  if (reason.includes("insufficient")) {
    return "retry";
  }

  if (reason.includes("declined")) {
    return "reminder";
  }

  if (reason.includes("repeated")) {
    return "stop";
  }

  if (reason.includes("bank")) {
    return "retry";
  }

  return "reminder";
}

module.exports = { getRecommendation };