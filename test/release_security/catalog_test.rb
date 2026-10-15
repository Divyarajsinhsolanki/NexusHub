require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'open3'
require 'json'
require 'rbconfig'
class SecurityCatalogTest < Minitest::Test
  def run_catalog(value, exists: true)
    Dir.mktmpdir('security-catalog-') do |root|
      FileUtils.mkdir_p(["#{root}/bin", "#{root}/config/security", "#{root}/test"])
      FileUtils.cp(File.expand_path('../../bin/security-regressions', __dir__), "#{root}/bin/security-regressions")
      File.write("#{root}/config/security/regressions.json", JSON.generate(value))
      File.write("#{root}/test/contract_test.rb", '') if exists
      Open3.capture3(RbConfig.ruby, "#{root}/bin/security-regressions", '--list')
    end
  end
  def test_empty_malformed_and_missing_test_catalogs_cannot_pass
    [{}, { 'tenancy' => [] }, { 'tenancy' => 'test/contract_test.rb' }].each do |value|
      _, _, status = run_catalog(value)
      refute status.success?
    end
    _, _, status = run_catalog({ 'tenancy' => ['test/contract_test.rb'] }, exists: false)
    refute status.success?
  end
  def test_valid_catalog_lists_exact_tests_without_running_rails
    output, errors, status = run_catalog({ 'tenancy' => ['test/contract_test.rb'] })
    assert status.success?, errors
    assert_equal "test/contract_test.rb\n", output
  end
end
