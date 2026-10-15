require 'json'
require 'net/http'
require 'uri'
require 'time'
require 'open3'

module ReleaseSecurity
  class Rejected < StandardError; end
  class Gate
    def initialize(repository:, sha:, client:, now: Time.now.utc)
      raise Rejected, 'Set a valid GitHub repository and full commit SHA.' unless repository.match?(%r{\A[A-Za-z0-9][A-Za-z0-9-]{0,38}/(?!\.{1,2}\z)[A-Za-z0-9_.-]+\z}) && sha.match?(/\A[0-9a-f]{40}\z/)
      @repository, @sha, @client, @now = repository, sha, client, now
    end

    def verify!(target:)
      raise Rejected, 'Target must be staging or production.' unless %w[staging production].include?(target)
      runs = @client.get("repos/#{@repository}/actions/workflows/ci.yml/runs", head_sha: @sha, per_page: 100).fetch('workflow_runs')
      trusted = runs.select { |run| run['head_sha'] == @sha && run.dig('head_repository', 'full_name') == @repository &&
        %w[push workflow_dispatch].include?(run['event']) && run['path'].to_s.split('@').first == '.github/workflows/ci.yml' }
      run = trusted.max_by { |item| [Time.iso8601(item.fetch('updated_at')), item.fetch('id')] }
      raise Rejected, 'The latest trusted CI run for this commit must have succeeded within 24 hours.' unless run && successful?(run) && fresh?(run['updated_at'], 86400)
      raise Rejected, 'Production requires a main-branch CI run.' if target == 'production' && run['head_branch'] != 'main'
      verify_staging! if target == 'production'
      { repository: @repository, sha: @sha, target:, ci_run_id: run.fetch('id'), verified_at: @now.iso8601 }
    rescue KeyError, TypeError, ArgumentError, NoMethodError
      raise Rejected, 'Release evidence is incomplete or invalid.'
    end

    def verify_staging!
      deployments = @client.get("repos/#{@repository}/deployments", sha: @sha, environment: 'staging', per_page: 100)
      deployment = deployments.select { |item| item['sha'] == @sha && item['environment'] == 'staging' }.max_by { |item| item.fetch('id') }
      raise Rejected, 'Deploy this exact commit to staging successfully before production.' unless deployment
      statuses = @client.get("repos/#{@repository}/deployments/#{deployment.fetch('id')}/statuses", per_page: 100)
      status = statuses.max_by { |item| item.fetch('id') }
      raise Rejected, 'The latest staging status must be a recent success.' unless status && status['state'] == 'success' && fresh?(status['created_at'], 7 * 86400)
      # Bind deployment evidence to this repository's completed deployment workflow,
      # rather than accepting a manually posted success status or another workflow.
      match = status['log_url'].to_s.match(%r{\Ahttps://github\.com/#{Regexp.escape(@repository)}/actions/runs/(\d+)(?:/.*)?\z})
      raise Rejected, 'Staging success must link to the trusted deployment workflow.' unless match
      run = @client.get("repos/#{@repository}/actions/runs/#{match[1]}")
      raise Rejected, 'Staging workflow provenance does not match this commit.' unless run['head_sha'] == @sha &&
        run.dig('head_repository', 'full_name') == @repository && run['path'].to_s.split('@').first == '.github/workflows/deploy-eb.yml' &&
        run['event'] == 'workflow_dispatch' && successful?(run)
    end

    def successful?(run)
      run['status'] == 'completed' && run['conclusion'] == 'success'
    end

    def fresh?(value, seconds)
      age = @now - Time.iso8601(value)
      age.between?(0, seconds)
    end
  end

  class GitHubClient
    def initialize(token:)
      raise Rejected, 'Provide a read-only GitHub token for release evidence.' if token.to_s.empty?
      @token = token
    end

    def get(path, parameters = {})
      uri = URI("https://api.github.com/#{path}")
      uri.query = URI.encode_www_form(parameters) unless parameters.empty?
      request = Net::HTTP::Get.new(uri)
      request['Authorization'] = "Bearer #{@token}"
      request['Accept'] = 'application/vnd.github+json'
      request['X-GitHub-Api-Version'] = '2022-11-28'
      request['User-Agent'] = 'Nexus-release-gate'
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 20) { |http| http.request(request) }
      raise Rejected, 'GitHub evidence is unavailable or access was denied; release blocked.' unless response.is_a?(Net::HTTPSuccess)
      JSON.parse(response.body)
    rescue JSON::ParserError, IOError, SystemCallError, Timeout::Error, OpenSSL::SSL::SSLError
      raise Rejected, 'GitHub evidence could not be verified; release blocked.'
    end
  end
end
