const sensitivePatterns: RegExp[] = [
  // 中国手机号（11位，以1开头）
  /\b1[3-9]\d{9}\b/g,
  // 邮箱
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  // 身份证号（18位）
  /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
  // 工号/学号/编号 前缀模式
  /\b(?:工号|学号|编号|职工号|教工号|教师编号)[:：]?\s*[A-Za-z0-9_-]{4,}\b/g,
  // 姓名自述
  /\b(?:我是|姓名是|我叫|我的名字是|本人)[一-龥A-Za-z·]{2,20}\b/g,
  // 银行卡号（16-19位纯数字）
  /\b\d{16,19}\b/g,
  // IP 地址
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
];

export const sanitizeForModel = (value: string): string => {
  return sensitivePatterns.reduce(
    (result, pattern) => result.replace(pattern, "[REDACTED]"),
    value
  ).trim();
};

export const truncateForModel = (value: string, maxLength: number): string => {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
};
