module MailerHelper
  def email_heading(title, eyebrow: 'Notification', intro: nil)
    safe_join([
      content_tag(:p, eyebrow.upcase, style: 'margin:0 0 10px;color:#2563eb;font-size:11px;font-weight:700;letter-spacing:1.4px;'),
      content_tag(:h1, title, style: 'margin:0 0 16px;color:#172033;font-size:26px;line-height:1.25;font-weight:700;'),
      (content_tag(:p, intro, style: 'margin:0 0 24px;color:#526079;font-size:15px;line-height:1.7;') if intro.present?)
    ].compact)
  end

  def email_details(rows)
    content_tag(:table, role: 'presentation', width: '100%', cellpadding: '0', cellspacing: '0', style: 'margin:20px 0;border:1px solid #e3e9f2;border-radius:10px;background:#f8fafc;table-layout:fixed;') do
      safe_join(rows.map do |label, value|
        content_tag(:tr) do
          content_tag(:td, style: 'padding:12px 16px;border-bottom:1px solid #e3e9f2;overflow-wrap:anywhere;word-break:break-word;') do
            safe_join([
              content_tag(:div, label, style: 'font-size:11px;line-height:1.5;color:#64748b;margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;'),
              content_tag(:div, value, style: 'font-size:14px;line-height:1.6;color:#172033;white-space:pre-wrap;')
            ])
          end
        end
      end)
    end
  end

  def email_button(label, url)
    uri = URI.parse(url.to_s)
    return unless %w[https http].include?(uri.scheme) && uri.host.present? && uri.userinfo.nil?
    safe_join([
      content_tag(:table, role: 'presentation', cellpadding: '0', cellspacing: '0', style: 'margin:24px 0;') do
        content_tag(:tr) do
          content_tag(:td, bgcolor: '#2563eb', style: 'border-radius:8px;text-align:center;') do
            link_to(label, url, style: 'display:inline-block;padding:14px 24px;border:1px solid #2563eb;border-radius:8px;color:#ffffff;background:#2563eb;font-size:14px;line-height:20px;font-weight:700;text-decoration:none;')
          end
        end
      end,
      content_tag(:p, style: 'margin:0 0 24px;font-size:11px;line-height:1.7;color:#64748b;overflow-wrap:anywhere;word-break:break-all;') do
        safe_join(['If the button does not work, copy this link into your browser:', tag.br, link_to(url, url, style: 'color:#2563eb;text-decoration:underline;')])
      end
    ])
  rescue URI::InvalidURIError
    nil
  end

  def email_note(text)
    content_tag(:p, text, style: 'margin:20px 0 0;padding:14px 16px;border-left:3px solid #93c5fd;background:#eff6ff;color:#42526d;font-size:12px;line-height:1.7;')
  end

  def email_code_block(text)
    content_tag(:pre, text, style: 'padding:16px;margin:16px 0;background:#f1f5f9;border:1px solid #e3e9f2;border-radius:8px;color:#334155;font-family:Consolas,monospace;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;')
  end
end
