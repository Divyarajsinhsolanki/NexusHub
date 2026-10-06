require "json"
require "digest"
require "aws-sdk-s3"

manifest = JSON.parse(File.read(ARGV.fetch(0)))
bucket = ENV.fetch("S3_BUCKET")
storage = File.expand_path("../storage", __dir__)
client = Aws::S3::Client.new(region: ENV.fetch("S3_REGION", "ap-south-1"))
copied = []
missing = []

manifest.each do |blob|
  next unless blob.fetch("service_name") == "local"

  key = blob.fetch("key")
  abort "Invalid object key" unless key.match?(/\A[a-zA-Z0-9_-]+\z/)
  path = File.join(storage, key[0, 2], key[2, 2], key)
  unless File.file?(path)
    missing << blob.fetch("id")
    next
  end
  checksum = Digest::MD5.file(path).base64digest
  abort "Local checksum mismatch for blob #{blob.fetch('id')}" unless
    File.size(path) == blob.fetch("byte_size") && checksum == blob.fetch("checksum")

  begin
    object = client.head_object(bucket: bucket, key: key)
    abort "Existing S3 object mismatch for blob #{blob.fetch('id')}" unless
      object.content_length == blob.fetch("byte_size") &&
      object.etag.delete('"') == Digest::MD5.file(path).hexdigest
  rescue Aws::S3::Errors::NotFound
    File.open(path, "rb") do |io|
      client.put_object(bucket: bucket, key: key, body: io, content_md5: checksum,
                        if_none_match: "*")
    end
  end
  copied << blob.fetch("id")
end

puts({ verified_blob_ids: copied, missing_local_blob_ids: missing }.to_json)
