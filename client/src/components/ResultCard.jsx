export default function ResultCard({ card, nights }) {
  return (
    <article className="card">
      {card.thumbnail ? (
        <img
          src={card.thumbnail}
          alt=""
          className="thumb"
          loading="lazy"
          onError={(e) => (e.target.style.display = 'none')}
        />
      ) : (
        <div className="thumb placeholder" />
      )}
      <div className="card-body">
        <h4>{card.name}</h4>
        <div className="meta-row">
          {card.stars ? <span className="stars">{'★'.repeat(card.stars)}</span> : null}
          {card.guestRating != null && (
            <span className="guest">
              👤 {card.guestRating}
              {card.reviewCount ? ` (${card.reviewCount})` : ''}
            </span>
          )}
        </div>
        {card.address && <p className="addr">{card.address}</p>}

        <div className="price-line">
          {card.total != null ? (
            <>
              <strong>${card.perNight ?? card.total}</strong>
              <span className="muted">
                {card.perNight && nights > 1
                  ? `/night · $${card.total} for ${nights} nights · ${card.bestOffer.label}`
                  : ` total · ${card.bestOffer.label}`}
              </span>
            </>
          ) : (
            <span className="muted">Live pricing appears once dates are set</span>
          )}
        </div>

        <div className="offers">
          {(card.offers || []).map(
            (o) =>
              o.total != null && (
                <a
                  key={o.supplier}
                  href={o.link || card.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`chip ${o.supplier === card.bestOffer?.supplier ? 'best' : ''}`}
                >
                  {o.label} · ${o.total}
                </a>
              )
          )}
        </div>

        <div className="policies">
          {card.freeCancellation && <span className="tag">Free cancellation</span>}
          {card.instantBook && <span className="tag">Instant book</span>}
          {card.guests ? <span className="tag">Sleeps {card.guests}</span> : null}
        </div>
      </div>
    </article>
  );
}
