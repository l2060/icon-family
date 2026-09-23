const english: Record<string, string> = {
  仅管理员或创建者可以修改项目设置: 'Only admins or the owner can change project settings.',
  'JS 文件名无效': 'Invalid JS filename.',
  协作用户无效: 'Invalid collaborator.',
  仅管理员或创建者可以删除项目: 'Only admins or the owner can delete a project.',
  '密码需为 6–128 位': 'Password must contain 6–128 characters.',
  当前密码错误: 'Current password is incorrect.',
  用户不存在: 'User not found.',
  请通过我的账号修改自己的密码: 'Change your own password in My account.',
  '购物车正在处理，请稍后重试': 'Your cart is being processed. Please try again shortly.',
  '图标 ID 无效': 'Invalid icon ID.',
  请选择购物车图标: 'Select icons in your cart.',
  '购物车已更新，请刷新后重试': 'Your cart has changed. Refresh and try again.',
  请选择目标项目: 'Select target projects.',
  没有权限访问目标项目: 'You do not have access to one or more target projects.',
  用户名或密码错误: 'Incorrect username or password.',
  请先登录: 'Please sign in first.',
  未登录: 'You are not signed in.',
  用户名或密码不符合要求: 'The username or password does not meet the requirements.',
  用户名已存在: 'This username already exists.',
  不能删除当前登录用户: 'You cannot delete the currently signed-in user.',
  不能删除最后一个管理员: 'The last administrator cannot be deleted.',
  只有管理员可以管理用户: 'Only administrators can manage users.',
  项目不存在: 'Project not found.',
  没有权限访问该项目: 'You do not have access to this project.',
  项目名称不能为空: 'Project name is required.',
  '边距必须是 0 到 512 之间的数字': 'Margin must be a number between 0 and 512.',
  要移除的前缀不能为空: 'Enter a prefix to remove.',
  图标不存在: 'Icon not found.',
  '图标已被其他操作修改，请刷新后重试': 'The icon was modified elsewhere. Refresh and try again.',
  '图标 slug 已存在': 'An icon with this slug already exists.',
  '生成 iconfont.js 失败': 'Failed to generate iconfont.js.',
  构建失败: 'Build failed.',
  服务器内部错误: 'Internal server error.',
  接口不存在: 'API endpoint not found.',
  资源不存在: 'Resource not found.',
};
export function apiErrorMessage(message: string, status: number) {
  if (document.documentElement.lang !== 'en') return message;
  if (english[message]) return english[message];
  if (status === 502)
    return `The iconfont service could not complete the request (${status}). Please try again.`;
  // Preserve unfamiliar server details rather than silently discarding diagnostics.
  return message;
}
