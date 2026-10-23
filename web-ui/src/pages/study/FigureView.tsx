import CardHtmlRender from '../../components/CardHtmlRender';

/**
 * A card's figure next to a tutor question. The figure is card HTML (inline
 * SVG or an image), so it renders in the sandboxed card frame, which also
 * fits it to the width and opens it large on a tap.
 */
export default function FigureView({ html }: { html: string }) {
  return <CardHtmlRender html={`<div class="lf-figure" style="text-align:center">${html}</div>`} flat />;
}
