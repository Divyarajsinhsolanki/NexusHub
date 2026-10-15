# Trusted, disposable Rails worker. Input is internal JSON over stdin, never
# shell interpolation, job arguments, a URL, or a password in process argv.
require_relative "../config/environment"
request = JSON.parse(STDIN.read(2 * 1024 * 1024))
arguments = request.fetch("arguments")
def restore_upload(value)
  return unless value
  ActionDispatch::Http::UploadedFile.new(tempfile: File.open(value.fetch("path"), "rb"),
    filename: value.fetch("filename"), type: value["content_type"])
end
begin
  case request.fetch("action")
  when "upload"
    user = User.find(arguments.fetch("user_id"))
    raise ArgumentError, "Workspace access removed" unless user.workspace_access?
    Current.user, Current.workspace = user, user.workspace
    document = PdfDocuments::Manager.create_from_upload!(user:, upload: restore_upload(arguments.fetch("upload")), title: arguments["title"])
    result = { document_id: document.id }
  when "operation"
    operation = PdfDocumentOperation.unscoped.find(arguments.fetch("operation_id"))
    user = operation.user
    raise ArgumentError, "Workspace access removed" unless user.workspace_access?(operation.workspace)
    Current.user, Current.workspace = user, operation.workspace
    PdfDocuments::OperationRunner.new(operation).run!(password: arguments["password"], execution_token: arguments["execution_token"],
      asset: restore_upload(arguments["asset"]), assets: arguments.fetch("assets", {}).transform_values { |value| restore_upload(value) })
    result = operation.reload.result
  else
    raise ArgumentError, "Unsupported PDF execution"
  end
  File.write(request.fetch("result_path"), JSON.generate(ok: true, result:))
rescue StandardError => error
  type = case error
  when PdfDocuments::Manager::StaleVersion then "stale"
  when PdfDocuments::Manager::QuotaExceeded then "quota"
  else "invalid"
  end
  message = error.is_a?(ArgumentError) || type != "invalid" ? error.message.first(500) : "PDF processing failed."
  File.write(request.fetch("result_path"), JSON.generate(ok: false, type:, error: message))
  exit 2
ensure
  Current.reset_all
end
