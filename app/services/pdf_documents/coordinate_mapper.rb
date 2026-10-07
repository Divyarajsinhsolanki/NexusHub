module PdfDocuments
  class CoordinateMapper
    def initialize(width:, height:, rotation: 0, left: 0, bottom: 0)
      @width = width.to_f
      @height = height.to_f
      @rotation = rotation.to_i % 360
      @left, @bottom = left.to_f, bottom.to_f
    end

    def point(x, y)
      x = x.to_f
      y = y.to_f

      result = case @rotation
      when 90 then [y, x]
      when 180 then [@width - x, y]
      when 270 then [@width - y, @height - x]
      else [x, @height - y]
      end
      [result[0] + @left, result[1] + @bottom]
    end

    def rectangle(x:, y:, width:, height:)
      corners = [
        point(x, y),
        point(x.to_f + width.to_f, y),
        point(x, y.to_f + height.to_f),
        point(x.to_f + width.to_f, y.to_f + height.to_f)
      ]
      xs = corners.map(&:first)
      ys = corners.map(&:last)
      {
        x: xs.min,
        y: ys.max,
        width: xs.max - xs.min,
        height: ys.max - ys.min,
        bottom: ys.min
      }
    end
  end
end
