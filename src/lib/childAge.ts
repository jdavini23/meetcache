export function formatChildAge(birthMonth: number, birthYear: number, now = new Date()) {
  const months = Math.max(
    0,
    (now.getFullYear() - birthYear) * 12 + (now.getMonth() + 1 - birthMonth),
  );

  if (months < 24) return `${months} month${months === 1 ? '' : 's'} old`;

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} old`;
}
