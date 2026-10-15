require "test_helper"
require "minitest/mock"
require "active_storage/service/private_cloudinary_service"

class PrivateCloudinaryServiceTest < ActiveSupport::TestCase
  test "private adapter refuses provider error bodies instead of serving them as files" do
    service = ActiveStorage::Service::PrivateCloudinaryService.new
    http = Object.new
    def http.request(_request)
      response = Struct.new(:code).new("404")
      yield response
    end
    service.stub(:url, "https://res.cloudinary.com/test/authenticated/file.pdf") do
      Net::HTTP.stub(:start, ->(*, **, &block) { block.call(http) }) do
        assert_raises(ActiveStorage::FileNotFoundError) { service.download("key") }
      end
    end
  end

  test "private adapter streams valid bytes and bounds range responses" do
    service = ActiveStorage::Service::PrivateCloudinaryService.new
    response = Object.new
    def response.code = "206"
    def response.read_body
      yield "%PDF"
    end
    http = Object.new
    http.define_singleton_method(:request) { |_request, &block| block.call(response) }
    service.stub(:url, "https://res.cloudinary.com/test/authenticated/file.pdf") do
      Net::HTTP.stub(:start, ->(*, **, &block) { block.call(http) }) do
        assert_equal "%PDF", service.download_chunk("key", 0..3)
        assert_raises(ActiveStorage::IntegrityError) { service.download_chunk("key", 0..1) }
      end
    end
  end
end
