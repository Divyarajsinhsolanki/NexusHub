module ApplicationHelper
  def page_metadata
    metadata = JSON.parse(File.read(Rails.root.join("app/javascript/config/pageMetadata.json")))
    path = request.path.delete_suffix("/").presence || "/"
    entry = metadata[path]
    unless entry
      pattern = { %r{\A/projects/[^/]+/dashboard\z} => "Sprint Dashboard", %r{\A/projects/[^/]+/metaverse\z} => "Project Metaverse", %r{\A/projects/[^/]+/issues\z} => "Issue Tracker", %r{\A/departments/[^/]+\z} => "Department Details", %r{\A/profile/[^/]+\z} => "Profile", %r{\A/chat/[^/]+\z} => "Chat", %r{\A/meet/[^/]+\z} => "Meeting" }
      title = pattern.find { |regex, _| regex.match?(path) }&.last || "Page Not Found"
      entry = { "title" => title, "description" => "#{title} in Nexus Hub. Manage your workspace and collaborate with your team." }
    end
    entry = { "title" => "Workspace Login", "description" => "Sign in or create a Nexus Hub workspace." } if path == "/" && !PortfolioAccess.enabled?
    brand = PortfolioAccess.enabled? ? "Divyarajsinh Solanki" : "Nexus Hub"
    entry.merge("title" => "#{entry['title']} | #{brand}", "url" => "#{seo_site_url}#{path}")
  end

  def seo_site_url
    ENV.fetch("BASE_URL", request.base_url).delete_suffix("/")
  end
end
