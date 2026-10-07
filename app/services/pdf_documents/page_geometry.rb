module PdfDocuments
  class PageGeometry
    attr_reader :left, :bottom, :width, :height, :rotation

    def initialize(left: 0, bottom: 0, width:, height:, rotation: 0, **)
      @left, @bottom, @width, @height = [left, bottom, width, height].map(&:to_f)
      @rotation = rotation.to_i % 360
    end

    def self.for_page(page)
      box = page.box(:crop)
      new(left: box.left, bottom: box.bottom, width: box.width, height: box.height, rotation: page[:Rotate] || 0)
    end

    def self.read(path)
      HexaPDF::Document.open(path).pages.map { |page| for_page(page).as_json }
    end

    def as_json(*)
      { left:, bottom:, width:, height:, rotation: }
    end

    def display_size
      [90, 270].include?(rotation) ? { width: height, height: width } : { width:, height: }
    end

    # PDF.js display coordinates have a top-left origin. PDF user coordinates
    # have a bottom-left origin and may have a nonzero CropBox offset.
    def matrix
      case rotation
      when 90 then [0, 1, 1, 0, left, bottom]
      when 180 then [-1, 0, 0, 1, left + width, bottom]
      when 270 then [0, -1, -1, 0, left + width, bottom + height]
      else [1, 0, 0, -1, left, bottom + height]
      end
    end

    def point(x, y)
      self.class.point(matrix, x, y)
    end

    def display_point(x, y)
      self.class.point(self.class.inverse(matrix), x, y)
    end

    def self.point(matrix, x, y)
      a, b, c, d, e, f = matrix
      [a * x.to_f + c * y.to_f + e, b * x.to_f + d * y.to_f + f]
    end

    def self.inverse(matrix)
      a, b, c, d, e, f = matrix
      determinant = a * d - b * c
      [d / determinant, -b / determinant, -c / determinant, a / determinant,
       (c * f - d * e) / determinant, (b * e - a * f) / determinant]
    end

    def self.multiply(first, second)
      a, b, c, d, e, f = first
      g, h, i, j, k, l = second
      [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j,
       a * k + c * l + e, b * k + d * l + f]
    end
  end
end
