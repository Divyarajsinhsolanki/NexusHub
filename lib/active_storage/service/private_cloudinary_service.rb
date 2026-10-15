require "active_storage/service/cloudinary_service"

class ActiveStorage::Service::PrivateCloudinaryService < ActiveStorage::Service::CloudinaryService
  MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024

  def initialize(**options)
    super(**options.merge(type: "authenticated", sign_url: true))
  end

  def download(key)
    result = +"".b unless block_given?
    fetch_private(key) { |chunk| block_given? ? yield(chunk) : result << chunk }
    result
  end

  def download_chunk(key, range)
    result = +"".b
    fetch_private(key, range:) { |chunk| result << chunk }
    result
  end

  private

  def fetch_private(key, range: nil)
    uri = URI(url(key))
    raise ActiveStorage::FileNotFoundError unless uri.scheme == "https"
    request = Net::HTTP::Get.new(uri)
    request["Range"] = "bytes=#{range.begin}-#{range.exclude_end? ? range.end - 1 : range.end}" if range
    Net::HTTP.start(uri.hostname, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 30) do |http|
      http.request(request) do |response|
        expected = range ? "206" : "200"
        raise ActiveStorage::FileNotFoundError unless response.code == expected
        maximum = range ? [range.size, MAX_DOWNLOAD_BYTES].min : MAX_DOWNLOAD_BYTES
        total = 0
        response.read_body do |chunk|
          total += chunk.bytesize
          raise ActiveStorage::IntegrityError, "Stored file exceeded its size limit" if total > maximum
          yield chunk.b
        end
      end
    end
  end
end
