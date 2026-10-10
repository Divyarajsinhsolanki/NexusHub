require "net/http"
require "resolv"
require "ipaddr"
require "nokogiri"
require "timeout"

module Chat
  class LinkPreview
    MAX_BYTES = 256 * 1024
    BLOCKED_NETWORKS = %w[0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4].map { |range| IPAddr.new(range) }.freeze

    def self.call(url)
      Rails.cache.fetch(["chat-link-preview-v1", Digest::SHA256.hexdigest(url)], expires_in: 6.hours) do
        Timeout.timeout(5) { new.fetch(url) }
      rescue StandardError
        {}
      end
    end

    def self.message_urls(body)
      body.to_s.scan(%r{(?:https?://|www\.)[^\s<>"']+}i).filter_map do |label|
        label = label.sub(/[.,!?;:]+$/, "")
        pairs = { ")" => "(", "]" => "[", "}" => "{" }
        while pairs.key?(label[-1]) && label.count(label[-1]) > label.count(pairs[label[-1]])
          label = label[0...-1]
        end
        label = "https://#{label}" if label.match?(/\Awww\./i)
        canonical_url(label)
      end
    end

    def self.canonical_url(value)
      uri = URI.parse(value).normalize
      return unless %w[http https].include?(uri.scheme) && uri.host.present? && uri.userinfo.nil?
      uri.path = "/" if uri.path.empty?
      uri.to_s
    rescue URI::InvalidURIError
      nil
    end

    def public_uri(value)
      uri = URI.parse(value.to_s)
      return unless %w[http https].include?(uri.scheme) && uri.host.present? && uri.userinfo.nil?
      return unless [80, 443].include?(uri.port)
      uri
    rescue URI::InvalidURIError
      nil
    end

    def public_address?(address)
      ip = IPAddr.new(address)
      # Only globally routed IPv6 unicast, excluding mapped IPv4 and special ranges.
      return IPAddr.new("2000::/3").include?(ip) && !IPAddr.new("2001::/23").include?(ip) && !IPAddr.new("2001:db8::/32").include?(ip) if ip.ipv6?
      BLOCKED_NETWORKS.none? { |network| network.include?(ip) }
    rescue IPAddr::InvalidAddressError
      false
    end

    def fetch(url)
      uri = public_uri(url)
      return {} unless uri
      addresses = Resolv.getaddresses(uri.hostname)
      return {} if addresses.empty? || addresses.any? { |address| !public_address?(address) }
      # Pin the validated address; don't follow redirects or forward user credentials.
      http = Net::HTTP.new(uri.hostname, uri.port, nil)
      http.ipaddr = addresses.first
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = 2
      http.read_timeout = 2
      http.write_timeout = 2
      body = +""
      http.start do |connection|
        connection.request(Net::HTTP::Get.new(uri.request_uri, "Accept" => "text/html", "User-Agent" => "NexusLinkPreview/1.0")) do |response|
          return {} unless response.is_a?(Net::HTTPSuccess) && response["content-type"].to_s.downcase.include?("text/html")
          response.read_body do |chunk|
            body << chunk
            return {} if body.bytesize > MAX_BYTES
          end
        end
      end
      parse(body, uri)
    rescue StandardError
      {}
    end

    def parse(html, uri)
      document = Nokogiri::HTML(html)
      meta = ->(key) { document.at_css("meta[property='#{key}'], meta[name='#{key}']")&.[]("content") }
      title = (meta.call("og:title").presence || document.at_css("title")&.text).to_s.squish.truncate(200)
      description = (meta.call("og:description").presence || meta.call("description")).to_s.squish.truncate(400)
      image = begin
        candidate = URI.join(uri.to_s, meta.call("og:image").to_s)
        if meta.call("og:image").present? && public_uri(candidate.to_s)
          image_addresses = Resolv.getaddresses(candidate.hostname)
          candidate.to_s if image_addresses.any? && image_addresses.all? { |address| public_address?(address) }
        end
      rescue URI::InvalidURIError
        nil
      end
      { url: uri.to_s, title: title, description: description, image: image, hostname: uri.host }
    end
  end
end
