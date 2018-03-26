import React from 'react'
import ReactDOM from 'react-dom'
import vuid from 'vuid'
import { set, del } from 'object-path-immutable'
import './index.css'

import { UserHeader } from './components/UserHeader'
import { UserList } from './components/UserList'
import { MessageList } from './components/MessageList'
import { TypingIndicator } from './components/TypingIndicator'
import { CreateMessageForm } from './components/CreateMessageForm'
import { RoomList } from './components/RoomList'
import { RoomHeader } from './components/RoomHeader'
import { CreateRoomForm } from './components/CreateRoomForm'
import { WelcomeScreen } from './components/WelcomeScreen'
import { JoinRoomScreen } from './components/JoinRoomScreen'

import ChatManager from './chatkit'

const githubAuthRedirect = () => {
  const client = '20cdd317000f92af12fe'
  const url = 'https://github.com/login/oauth/authorize'
  const server = 'https://chatkit-demo-server.herokuapp.com'
  const redirect =
    window.location.port === '3000'
      ? `${server}/success?url=${window.location.href}`
      : `${server}/success`
  const nonce = vuid()
  window.localStorage.setItem('nonce', nonce)
  window.location = `${url}?scope=user:email&client_id=${client}&state=${nonce}&redirect_uri=${redirect}`
}

class View extends React.Component {
  state = {
    user: {},
    room: {},
    messages: {},
    typing: {},
    sidebarOpen: false,
    userListOpen: false,
  }

  actions = {
    // --------------------------------------
    // User
    // --------------------------------------

    setUser: user => this.setState({ user }),

    // --------------------------------------
    // UI
    // --------------------------------------

    setSidebar: sidebarOpen => this.setState({ sidebarOpen }),
    setUserList: userListOpen => this.setState({ userListOpen }),

    // --------------------------------------
    // Room
    // --------------------------------------

    joinRoom: (room = {}) => {
      this.actions.setRoom(room)
      this.actions.subscribeToRoom(room)
      this.state.messages[room.id] &&
        this.actions.setCursor(
          room.id,
          Object.keys(this.state.messages[room.id]).pop()
        )
    },

    subscribeToRoom: room =>
      !this.state.user.roomSubscriptions[room.id] &&
      this.state.user.subscribeToRoom({
        roomId: room.id,
        hooks: { onNewMessage: this.actions.addMessage },
      }),

    createRoom: options =>
      this.state.user.createRoom(options).then(this.actions.joinRoom),

    createConvo: options => {
      if (options.user.id !== this.state.user.id) {
        const exists = this.state.user.rooms.find(
          x =>
            x.name === options.user.id + this.state.user.id ||
            x.name === this.state.user.id + options.user.id
        )
        exists
          ? this.actions.joinRoom(exists)
          : this.actions.createRoom({
              name: this.state.user.id + options.user.id,
              addUserIds: [options.user.id],
              private: true,
            })
      }
    },

    setRoom: room => {
      this.setState({ room, sidebarOpen: false })
      this.actions.scrollToEnd()
    },

    removeRoom: room => this.setState({ room: {} }),

    addUserToRoom: ({ userId, roomId = this.state.room.id }) =>
      this.state.user
        .addUserToRoom({ userId, roomId })
        .then(this.actions.setRoom),

    removeUserFromRoom: ({ userId, roomId = this.state.room.id }) =>
      userId === this.state.user.id
        ? this.state.user.leaveRoom({ roomId })
        : this.state.user
            .removeUserFromRoom({ userId, roomId })
            .then(this.actions.setRoom),

    // --------------------------------------
    // Cursors
    // --------------------------------------

    setCursor: (roomId, position) =>
      this.state.user
        .setReadCursor({ roomId, position: parseInt(position) })
        .then(x => this.forceUpdate()),

    // --------------------------------------
    // Messages
    // --------------------------------------

    addMessage: payload => {
      const roomId = payload.room.id
      const messageId = payload.id
      this.setState(set(this.state, ['messages', roomId, messageId], payload))
      if (roomId === this.state.room.id) {
        const cursor = this.state.user.readCursor({ roomId }) || {}
        const cursorPosition = cursor.position || 0
        cursorPosition < messageId && this.actions.setCursor(roomId, messageId)
        this.actions.scrollToEnd()
      }
    },

    runCommand: command => {
      const commands = {
        invite: ([userId]) => this.actions.addUserToRoom({ userId }),
        remove: ([userId]) => this.actions.removeUserFromRoom({ userId }),
        leave: ([userId]) =>
          this.actions.removeUserFromRoom({ userId: this.state.user.id }),
      }
      const name = command.split(' ')[0]
      const args = command.split(' ').slice(1)
      const exec = commands[name]
      exec && exec(args).catch(console.log)
    },

    scrollToEnd: e =>
      setTimeout(() => {
        const elem = document.querySelector('section > ul')
        elem && (elem.scrollTop = 100000)
      }, 0),

    // --------------------------------------
    // Typing Indicators
    // --------------------------------------

    isTyping: (room, user) =>
      this.setState(set(this.state, ['typing', room.id, user.id], true)),

    notTyping: (room, user) =>
      this.setState(del(this.state, ['typing', room.id, user.id])),

    // --------------------------------------
    // Presence
    // --------------------------------------

    setUserPresence: () => this.forceUpdate(),
  }

  componentDidMount() {
    const params = new URLSearchParams(window.location.search.slice(1))
    const code =
      params.get('state') === window.localStorage.getItem('nonce') &&
      params.get('code')
    code
      ? fetch('https://chatkit-demo-server.herokuapp.com/auth', {
          method: 'POST',
          body: JSON.stringify({ code }),
        })
          .then(res => res.json())
          .then(user => {
            window.localStorage.removeItem('nonce')
            window.history.replaceState(null, null, window.location.pathname)
            ChatManager(this, user)
          })
      : githubAuthRedirect()
  }

  render() {
    const {
      user,
      room,
      messages,
      typing,
      sidebarOpen,
      userListOpen,
    } = this.state
    const { createRoom, createConvo, removeUserFromRoom } = this.actions
    return (
      <main>
        <aside data-open={sidebarOpen}>
          <UserHeader user={user} />
          <RoomList
            user={user}
            rooms={user.rooms}
            messages={messages}
            current={room}
            actions={this.actions}
          />
          {user.id ? <CreateRoomForm submit={createRoom} /> : null}
        </aside>
        {room.id ? (
          <section>
            <RoomHeader state={this.state} actions={this.actions} />
            <TypingIndicator typing={typing[room.id]} />
            <MessageList
              user={user}
              messages={messages[room.id]}
              createConvo={createConvo}
            />
            <CreateMessageForm state={this.state} actions={this.actions} />
            {userListOpen && room.userIds.length > 2 ? (
              <UserList
                room={room}
                current={user.id}
                createConvo={createConvo}
                removeUser={removeUserFromRoom}
              />
            ) : null}
          </section>
        ) : user.id ? (
          <JoinRoomScreen />
        ) : (
          <WelcomeScreen />
        )}
      </main>
    )
  }
}

ReactDOM.render(<View />, document.querySelector('#root'))
