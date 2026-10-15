# Keep multipart field/file counts bounded independently of byte limits.
Rack::Utils.multipart_file_limit = 20
Rack::Utils.multipart_total_part_limit = 128
Rack::Utils.param_depth_limit = 32
