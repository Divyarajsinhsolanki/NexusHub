# Standalone parser. Deliberately does not boot Rails or receive its environment.
require "json"
require "hexapdf"
begin
  request = JSON.parse(STDIN.read(4096))
  password = request["password"]
  options = password.to_s.empty? ? {} : { decryption_opts: { password: password } }
  document = HexaPDF::Document.open(ARGV.fetch(0), **options)
  count = document.pages.count
  raise ArgumentError, "PDF must contain between 1 and 2000 pages" unless count.between?(1, 2000)
  puts JSON.generate(page_count: count, encrypted: document.encrypted?)
rescue HexaPDF::EncryptionError
  if password.to_s.empty?
    puts JSON.generate(page_count: nil, encrypted: true)
  else
    puts JSON.generate(error: "The PDF password is incorrect.")
    exit 2
  end
rescue StandardError
  puts JSON.generate(error: "PDF is corrupted, unreadable, or exceeds processing limits.")
  exit 2
end
