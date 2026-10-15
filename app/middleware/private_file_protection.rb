require "pathname"

# Runs before Rails static serving, including public/ files left by older PDF tools.
class PrivateFileProtection
  def initialize(app)
    @app = app
  end

  def call(env)
    path = Pathname.new(Rack::Utils.unescape_path(env["PATH_INFO"].to_s).gsub(%r{/+}, "/")).cleanpath.to_s
    if path.match?(%r{\A/(?:uploads|documents|temp_uploads)(?:/|\z)}) ||
        path.match?(%r{\A/(?:pdf_file|pdf_artifact)(?:/|\z)}) || path == "/download_pdf"
      return [410, { "content-type" => "application/json", "cache-control" => "no-store" }, ['{"error":"legacy_file_retired","message":"Re-upload this document to your private PDF library."}']]
    end
    @app.call(env)
  end
end
