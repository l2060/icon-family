// Keep the existing settings key and canonical .js value for compatibility.
export function normalizeExportFilename(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw Object.assign(new Error('导出文件名无效'), { statusCode: 400 });
  const base = value.trim().replace(/\.(js|ttf)$/i, '');
  if (!base) return '';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(base)) {
    throw Object.assign(new Error('导出文件名无效'), { statusCode: 400 });
  }
  return `${base}.js`;
}

export function exportFilename(project, format) {
  const base = (project.settings.jsFilename || 'iconfont').replace(/\.(js|ttf)$/i, '');
  return `${base}.${format}`;
}
