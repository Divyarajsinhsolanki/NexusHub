class PagesController < ApplicationController
  def index
    response.set_header("X-Robots-Tag", "noindex, nofollow") unless public_portfolio_page?
    respond_to do |format|
      format.html
      format.any { head :not_acceptable }
    end
  end

  def sitemap
    base_url = ENV.fetch("BASE_URL", request.base_url).delete_suffix("/")
    paths = PortfolioAccess.enabled? ? ["/", "/contact", "/legal"] : ["/"]
    body = paths.map { |path| "<url><loc>#{ERB::Util.html_escape("#{base_url}#{path}")}</loc></url>" }.join

    render xml: %(<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">#{body}</urlset>)
  end

  def robots
    base_url = ENV.fetch("BASE_URL", request.base_url).delete_suffix("/")
    render plain: "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nSitemap: #{base_url}/sitemap.xml\n"
  end
end
