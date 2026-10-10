require "test_helper"

class ChatLinkPreviewTest < ActiveSupport::TestCase
  setup { @preview = Chat::LinkPreview.new }

  test "rejects private and special addresses including mapped IPv6" do
    %w[127.0.0.1 10.1.2.3 169.254.169.254 192.168.1.1 100.64.1.1 ::1 ::ffff:8.8.8.8 fe80::1 2001:db8::1].each do |address|
      assert_not @preview.public_address?(address), address
    end
    assert @preview.public_address?("8.8.8.8")
    assert @preview.public_address?("2606:4700:4700::1111")
  end

  test "message URLs preserve balanced parentheses, strip punctuation and normalize query-only paths" do
    assert_equal ["https://example.com/wiki/Test_(one)", "https://www.example.com/?x=1"],
      Chat::LinkPreview.message_urls("Read (https://example.com/wiki/Test_(one)), www.example.com?x=1.")
  end

  test "only accepts credential-free http URLs with standard ports" do
    %w[file:///etc/passwd http://user:secret@example.com https://example.com:444].each { |url| assert_nil @preview.public_uri(url) }
    assert @preview.public_uri("https://example.com")
  end

  test "extracts escaped metadata with title and description fallbacks" do
    result = @preview.parse('<title>Website &amp; news</title><meta name="description" content="Latest updates">', URI("https://example.com/page"))
    assert_equal "Website & news", result[:title]
    assert_equal "Latest updates", result[:description]
    assert_equal "example.com", result[:hostname]
    assert_nil result[:image]
  end
end
