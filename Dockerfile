# syntax = docker/dockerfile:1

ARG RUBY_VERSION=3.3.12
FROM registry.docker.com/library/ruby:$RUBY_VERSION-slim as base

WORKDIR /rails

ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development test"

# --- Build Stage ---
FROM base as build

RUN apt-get update -qq && \
        apt-get install --no-install-recommends -y \
            build-essential \
            curl \
      git \
      libpq-dev \
      libyaml-dev \
      libvips \
      node-gyp \
            xz-utils \
      pkg-config \
      python-is-python3

# Match the Bundler version recorded in Gemfile.lock.
RUN gem install bundler -v 4.0.6

ARG NODE_VERSION=24.18.0
ARG YARN_VERSION=1.22.22
ENV PATH=/usr/local/bin:$PATH
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz && \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && \
    npm install -g yarn@${YARN_VERSION} && \
    rm -f /tmp/node.tar.xz

COPY Gemfile Gemfile.lock ./
COPY vendor/pdf_master ./vendor/pdf_master
RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    RUBYOPT="-W0" bundle exec bootsnap precompile --gemfile

COPY package.json yarn.lock tailwind.config.js postcss.config.js ./
RUN YARN_WORKSPACES_EXPERIMENTAL=false yarn install --frozen-lockfile --silent

COPY . .

RUN bundle exec bootsnap precompile app/ lib/

# Provide non-sensitive placeholders while production assets are compiled.
ENV SMTP_ADDRESS="smtp.example.com" \
    SMTP_PORT="587" \
    SMTP_USERNAME="dummy@example.com" \
    SMTP_PASSWORD="dummy" \
    SECRET_KEY_BASE="dummy_secret_key_base_for_build" \
    KEKA_API_KEY_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef" \
    ACTIVE_STORAGE_SERVICE="local"

RUN RAILS_ENV=production bin/vite build
RUN RAILS_ENV=production bundle exec rails assets:precompile

# --- Final Runtime Stage ---
FROM base

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      libpq5 \
      libvips \
      imagemagick \
      poppler-utils \
      ghostscript \
      qpdf && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

COPY --from=build /usr/local/bundle /usr/local/bundle
COPY --from=build /rails /rails

# Ensure all required directories exist before chown
RUN mkdir -p db log storage tmp public/vite-production && \
    useradd rails --create-home --shell /bin/bash && \
    chown -R rails:rails db log storage tmp public/vite-production

USER rails:rails

ENTRYPOINT ["/rails/bin/docker-entrypoint"]

EXPOSE 3000
CMD ["./bin/rails", "server"]
