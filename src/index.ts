import './scss/styles.scss';

import { AuctionAPI } from './components/AuctionAPI';
import { API_URL, CDN_URL } from './utils/constants';
import { EventEmitter } from './components/base/events';
import { AppState, CatalogChangeEvent, LotItem } from './components/AppData';
import { Page } from './components/Page';
import { Auction, AuctionItem, BidItem, CatalogItem } from './components/Card';
import { cloneTemplate, createElement, ensureElement } from './utils/utils';
import { Modal } from './components/common/Modal';
import { Basket } from './components/common/Basket';
import { Tabs } from './components/common/Tabs';
import { IOrderForm } from './types';
import { Order } from './components/Order';
import { Success } from './components/common/Success';

// инициализация event emitter и api
const events = new EventEmitter();
const api = new AuctionAPI(CDN_URL, API_URL);

// логирование всех событий для отладки
events.onAll(({ eventName, data }) => {
	console.log(eventName, data);
});

// шаблоны для карточек и модалок
const cardCatalogTemplate = ensureElement<HTMLTemplateElement>('#card');
const cardPreviewTemplate = ensureElement<HTMLTemplateElement>('#preview');
const auctionTemplate = ensureElement<HTMLTemplateElement>('#auction');
const cardBasketTemplate = ensureElement<HTMLTemplateElement>('#bid');
const bidsTemplate = ensureElement<HTMLTemplateElement>('#bids');
const basketTemplate = ensureElement<HTMLTemplateElement>('#basket');
const tabsTemplate = ensureElement<HTMLTemplateElement>('#tabs');
const soldTemplate = ensureElement<HTMLTemplateElement>('#sold');
const orderTemplate = ensureElement<HTMLTemplateElement>('#order');
const successTemplate = ensureElement<HTMLTemplateElement>('#success');

// модель данных приложения
const appData = new AppState({}, events);

// глобальные контейнеры
const page = new Page(document.body, events);
const modal = new Modal(ensureElement<HTMLElement>('#modal-container'), events);

// переиспользуемые компоненты интерфейса
const bids = new Basket(cloneTemplate(bidsTemplate), events);
const basket = new Basket(cloneTemplate(basketTemplate), events);
const tabs = new Tabs(cloneTemplate(tabsTemplate), {
	onClick: (name) => {
		if (name === 'closed') events.emit('basket:open');
		else events.emit('bids:open');
	},
});
const order = new Order(cloneTemplate(orderTemplate), events);

// обработка изменения каталога
events.on<CatalogChangeEvent>('items:changed', () => {
	page.catalog = appData.catalog.map((item) => {
		const card = new CatalogItem(cloneTemplate(cardCatalogTemplate), {
			onClick: () => events.emit('card:select', item),
		});
		return card.render({
			title: item.title,
			image: item.image,
			description: item.about,
			status: {
				status: item.status,
				label: item.statusLabel,
			},
		});
	});

	page.counter = appData.getClosedLots().length;
});

// обработка отправки формы заказа
events.on('order:submit', () => {
	api
		.orderLots(appData.order)
		.then((result) => {
			const success = new Success(cloneTemplate(successTemplate), {
				onClick: () => {
					modal.close();
					appData.clearBasket();
					events.emit('auction:changed');
				},
			});

			modal.render({
				content: success.render({}),
			});
		})
		.catch((err) => {
			console.error(err);
		});
});

// изменение состояния валидации формы
events.on('formErrors:change', (errors: Partial<IOrderForm>) => {
	const { email, phone } = errors;
	order.valid = !email && !phone;
	order.errors = Object.values({ phone, email })
		.filter((i) => !!i)
		.join('; ');
});

// изменение полей формы
events.on(
	/^order\..*:change/,
	(data: { field: keyof IOrderForm; value: string }) => {
		appData.setOrderField(data.field, data.value);
	}
);

// открытие формы заказа
events.on('order:open', () => {
	modal.render({
		content: order.render({
			phone: '',
			email: '',
			valid: false,
			errors: [],
		}),
	});
});

// открытие активных лотов
events.on('bids:open', () => {
	modal.render({
		content: createElement<HTMLElement>('div', {}, [
			tabs.render({
				selected: 'active',
			}),
			bids.render(),
		]),
	});
});

// открытие закрытых лотов
events.on('basket:open', () => {
	modal.render({
		content: createElement<HTMLElement>('div', {}, [
			tabs.render({
				selected: 'closed',
			}),
			basket.render(),
		]),
	});
});

// обработка изменений в лотах
events.on('auction:changed', () => {
	page.counter = appData.getClosedLots().length;
	bids.items = appData.getActiveLots().map((item) => {
		const card = new BidItem(cloneTemplate(cardBasketTemplate), {
			onClick: () => events.emit('preview:changed', item),
		});
		return card.render({
			title: item.title,
			image: item.image,
			status: {
				amount: item.price,
				status: item.isMyBid,
			},
		});
	});
	const total = 0;
	basket.items = appData.getClosedLots().map((item) => {
		const card = new BidItem(cloneTemplate(soldTemplate), {
			onClick: (event) => {
				const checkbox = event.target as HTMLInputElement;
				appData.toggleOrderedLot(item.id, checkbox.checked);
				basket.total = appData.getTotal();
				basket.selected = appData.order.items;
			},
		});
		return card.render({
			title: item.title,
			image: item.image,
			status: {
				amount: item.price,
				status: item.isMyBid,
			},
		});
	});
	basket.selected = appData.order.items;
	basket.total = total;
});

// открытие выбранного лота
events.on('card:select', (item: LotItem) => {
	appData.setPreview(item);
});

// изменение выбранного лота
events.on('preview:changed', (item: LotItem) => {
	const showItem = (item: LotItem) => {
		const card = new AuctionItem(cloneTemplate(cardPreviewTemplate));
		const auction = new Auction(cloneTemplate(auctionTemplate), {
			onSubmit: (price) => {
				item.placeBid(price);
				auction.render({
					status: item.status,
					time: item.timeStatus,
					label: item.auctionStatus,
					nextBid: item.nextBid,
					history: item.history,
				});
			},
		});

		modal.render({
			content: card.render({
				title: item.title,
				image: item.image,
				description: item.description.split('\n'),
				status: auction.render({
					status: item.status,
					time: item.timeStatus,
					label: item.auctionStatus,
					nextBid: item.nextBid,
					history: item.history,
				}),
			}),
		});

		if (item.status === 'active') {
			auction.focus();
		}
	};

	if (item) {
		api
			.getLotItem(item.id)
			.then((result) => {
				item.description = result.description;
				item.history = result.history;
				showItem(item);
			})
			.catch((err) => {
				console.error(err);
			});
	} else {
		modal.close();
	}
});

// блокировка прокрутки страницы при открытии модалки
events.on('modal:open', () => {
	page.locked = true;
});

// разблокировка прокрутки страницы при закрытии модалки
events.on('modal:close', () => {
	page.locked = false;
});

// загрузка лотов с сервера
api
	.getLotList()
	.then(appData.setCatalog.bind(appData))
	.catch((err) => {
		console.error(err);
	});
