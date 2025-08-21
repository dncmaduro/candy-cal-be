// Vietnamese labels for System Logs select options
// Map technical values to human-friendly Vietnamese labels used by FE selects.

export const viLabels = {
  type: {
    auth: "Xác thực tài khoản",
    users: "Người dùng",
    items: "Mặt hàng",
    products: "Sản phẩm",
    storage: "Kho",
    storagelogs: "Nhật ký kho",
    notifications: "Thông báo",
    combos: "Combo",
    orders: "Đơn hàng",
    "delivered-request": "Yêu cầu xuất kho",
    delivered: "Xuất kho",
    dailylogs: "Nhật ký ngày",
    dailyads: "Quảng cáo ngày",
    income: "Doanh thu",
    packingrules: "Quy tắc đóng gói",
    system: "Hệ thống",
    security: "Bảo mật"
  } as Record<string, string>,
  action: {
    // auth
    login_success: "Đăng nhập thành công",
    login_failed: "Đăng nhập thất bại",

    // common
    created: "Tạo",
    updated: "Cập nhật",
    deleted: "Xóa",

    // products
    items_updated: "Cập nhật mặt hàng",
    calculated_from_xlsx: "Tính toán từ Excel",
    ready_status_changed: "Đổi trạng thái sẵn sàng",

    // combos
    toggled: "Đổi trạng thái",

    // notifications
    read: "Đã đọc",
    unread: "Chưa đọc",
    all_read: "Đánh dấu tất cả đã đọc",
    all_viewed: "Đánh dấu tất cả đã xem",

    // orders/logs
    log_session_created: "Tạo phiên ghi log",
    range_queried: "Truy vấn theo khoảng",
    log_created: "Tạo log",
    logs_range_queried: "Truy vấn log theo khoảng",

    // delivered requests
    request_created: "Tạo yêu cầu",
    comment_added: "Thêm bình luận",
    accepted: "Chấp nhận",
    undo_accept: "Hoàn tác chấp nhận",
    search: "Tìm kiếm",

    // users
    password_changed: "Đổi mật khẩu",
    avatar_updated: "Cập nhật ảnh đại diện",
    profile_updated: "Cập nhật hồ sơ",

    // sessions/dailylogs
    session_created: "Tạo phiên",
    session_deleted: "Xóa phiên",

    // income
    inserted: "Thêm",
    deleted_by_date: "Xóa theo ngày",
    update_affiliate: "Cập nhật affiliate",
    update_box: "Cập nhật box",
    export_xlsx: "Xuất Excel",

    // errors/security
    unexpected_error: "Lỗi không mong muốn",
    permission_denied: "Từ chối quyền",
    validation_failed: "Xác thực thất bại"
  } as Record<string, string>,
  entity: {
    http: "HTTP",
    auth: "Xác thực",
    user: "Người dùng",
    item: "Mặt hàng",
    product: "Sản phẩm",
    xlsx: "Tệp Excel",
    storage_item: "Hàng trong kho",
    storage_log: "Nhật ký kho",
    ready_combo: "Combo có sẵn",
    session_log: "Phiên nhật ký",
    daily_log: "Nhật ký ngày",
    notification: "Thông báo",
    order_log_session: "Phiên log đơn hàng",
    order_logs: "Nhật ký đơn hàng",
    order_log: "Log đơn hàng",
    packing_rule: "Quy tắc đóng gói",
    common_order: "Đơn hàng chung",
    delivered_request: "Yêu cầu xuất kho",
    income: "Doanh thu"
  } as Record<string, string>,
  result: {
    success: "Thành công",
    failed: "Thất bại"
  } as Record<string, string>
}

export function labelOf(kind: keyof typeof viLabels, value?: string): string {
  if (!value) return ""
  const map = viLabels[kind]
  return map[value] || value
}
