require 'test_helper'
require 'minitest/mock'

class LivekitRoomPresenceTest < ActiveSupport::TestCase
  setup do
    @previous = ENV.to_h.slice('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET')
    ENV['LIVEKIT_URL'] = 'wss://media.example.test'
    ENV['LIVEKIT_API_KEY'] = 'testkey'
    ENV['LIVEKIT_API_SECRET'] = 'testsecret'
    @call = Struct.new(:livekit_room_name).new('private-room')
  end

  teardown do
    %w[LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET].each { |name| @previous.key?(name) ? ENV[name] = @previous[name] : ENV.delete(name) }
  end

  test 'uses a signed room-scoped service request and only counts connected media' do
    response = Net::HTTPOK.new('1.1', '200', 'OK')
    response.define_singleton_method(:body) { { participants: [{identity:'active-user',state:'ACTIVE'},{identity:'numeric-user',state:2},{identity:'joining-user',state:'JOINING'},{identity:'disconnected-user',state:'DISCONNECTED'}] }.to_json }
    with_response(response, check: ->(request) {
      assert_equal '/twirp/livekit.RoomService/ListParticipants', request.path
      assert_equal 'private-room', JSON.parse(request.body)['room']
      token = request['Authorization'].delete_prefix('Bearer ')
      payload = JWT.decode(token, 'testsecret', true, algorithm: 'HS256').first
      assert_equal({ 'roomAdmin' => true, 'room' => 'private-room' }, payload['video'])
    }) do
      assert_equal %w[active-user numeric-user], Chat::LivekitRoomPresence.identities(@call)
    end
  end

  test 'an omitted protobuf participants array means empty but server errors are unavailable' do
    response = Net::HTTPOK.new('1.1', '200', 'OK')
    response.define_singleton_method(:body) { '{}' }
    with_response(response) { assert_empty Chat::LivekitRoomPresence.identities(@call) }
    error = Net::HTTPServiceUnavailable.new('1.1', '503', 'Unavailable')
    error.define_singleton_method(:body) { '{}' }
    with_response(error) { assert_raises(Chat::LivekitRoomPresence::Unavailable) { Chat::LivekitRoomPresence.identities(@call) } }
  end

  test 'only explicit room not-found is treated as an empty room' do
    response = Net::HTTPNotFound.new('1.1', '404', 'Not Found')
    response.define_singleton_method(:body) { '{"code":"not_found"}' }
    with_response(response) { assert_empty Chat::LivekitRoomPresence.identities(@call) }
    response.define_singleton_method(:body) { '<html>Proxy error</html>' }
    with_response(response) { assert_raises(Chat::LivekitRoomPresence::Unavailable) { Chat::LivekitRoomPresence.identities(@call) } }
  end

  private

  def with_response(response, check: nil)
    http = Object.new
    http.define_singleton_method(:request) do |request|
      check&.call(request)
      response
    end
    Net::HTTP.stub(:start, ->(*, **, &block) { block.call(http) }) { yield }
  end
end
